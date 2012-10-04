Plugin = require('../plugin')
LastFmNode = require('lastfm').LastFmNode

module.exports = class LastFm extends Plugin
  constructor: ->
    super
    @lastfm = new LastFmNode
      api_key: process.env.LASTFM_API_KEY
      secret: process.env.LASTFM_SECRET
    @previous_now_playing_id = null
    @last_playing_item = null
    @playing_start = new Date()
    @playing_time = 0
    @previous_play_state = null

    setTimeout @flushScrobbleQueue, 120000

  restoreState: (state) =>
    @scrobblers = state.lastfm_scrobblers ? {}
    @scrobbles = state.scrobbles ? []

  saveState: (state) =>
    state.lastfm_scrobblers = @scrobblers
    state.scrobbles = @scrobbles
    state.status.lastfm_api_key = process.env.LASTFM_API_KEY

  setMpd: (@mpd) =>
    @mpd.on 'statusupdate', =>
      @updateNowPlaying()
      @checkScrobble()

  onSocketConnection: (socket) =>
    socket.on 'LastfmGetSession', (data) =>
      @lastfm.request "auth.getSession",
        token: data.toString()
        handlers:
          success: (data) =>
            # clear them from the scrobblers
            delete @scrobblers[data?.session?.name]
            socket.emit 'LastfmGetSessionSuccess', JSON.stringify(data)
          error: (error) =>
            console.error "error from last.fm auth.getSession: #{error.message}"
            socket.emit 'LastfmGetSessionError', JSON.stringify(error)
    socket.on 'LastfmScrobblersAdd', (data) =>
      data_str = data.toString()
      params = JSON.parse(data_str)
      # ignore if scrobbling user already exists. this is a fake request.
      return if @scrobblers[params.username]?
      @scrobblers[params.username] = params.session_key
      @emit('state_changed')
    socket.on 'LastfmScrobblersRemove', (data) =>
      params = JSON.parse(data.toString())
      session_key = @scrobblers[params.username]
      if session_key is params.session_key
        delete @scrobblers[params.username]
        @emit('state_changed')
      else
        console.warn "Invalid session key from user trying to remove scrobbler: #{params.username}"

  flushScrobbleQueue: =>
    max_simultaneous = 10
    count = 0
    while (params = @scrobbles.shift())? and count++ < max_simultaneous
      console.info "scrobbling #{params.track} for session #{params.sk}"
      params.handlers =
        error: (error) =>
          console.error "error from last.fm track.scrobble: #{error.message}"
          if not error?.code? or error.code is 11 or error.code is 16
            # retryable - add to queue
            @scrobbles.push params
            @emit('state_changed')
      @lastfm.request 'track.scrobble', params
    @emit('state_changed')

  queueScrobble: (params) =>
    @scrobbles.push params
    @emit('state_changed')

  checkTrackNumber: (trackNumber) =>
    if parseInt(trackNumber) >= 0 then trackNumber else ""
  checkScrobble: =>
    this_item = @mpd.status.current_item

    if @mpd.status.state is 'play'
      if @previous_play_state isnt 'play'
        @playing_start = new Date(new Date().getTime() - @playing_time)
        @previous_play_state = @mpd.status.state
    @playing_time = new Date().getTime() - @playing_start.getTime()

    return unless this_item?.id isnt @last_playing_item?.id
    if (track = @last_playing_item?.track)?
      # then scrobble it
      min_amt = 15 * 1000
      max_amt = 4 * 60 * 1000
      half_amt = track.time / 2 * 1000
      if @playing_time >= min_amt and (@playing_time >= max_amt or @playing_time >= half_amt)
        if track.artist_name
          for username, session_key of @scrobblers
            @queueScrobble
              sk: session_key
              timestamp: Math.round(@playing_start.getTime() / 1000)
              album: track.album?.name or ""
              track: track.name or ""
              artist: track.artist_name or ""
              albumArtist: track.album_artist_name or ""
              duration: track.time or ""
              trackNumber: @checkTrackNumber track.track
          @flushScrobbleQueue()
        else
          console.warn "Not scrobbling #{track.name} - missing artist."

    @last_playing_item = this_item
    @previous_play_state = @mpd.status.state
    @playing_start = new Date()
    @playing_time = 0

  updateNowPlaying: =>
    return unless @mpd.status.state is 'play'
    return unless (track = @mpd.status.current_item?.track)?

    return unless @previous_now_playing_id isnt @mpd.status.current_item.id
    @previous_now_playing_id = @mpd.status.current_item.id

    if not track.artist_name
      console.warn "Not updating last.fm now playing for #{track.name}: missing artist"
      return

    for username, session_key of @scrobblers
      @lastfm.request "track.updateNowPlaying",
        sk: session_key
        track: track.name or ""
        artist: track.artist_name or ""
        album: track.album?.name or ""
        albumArtist: track.album_artist_name or ""
        trackNumber: @checkTrackNumber track.track
        duration: track.time or ""
        handlers:
          error: (error) =>
            console.error "error from last.fm track.updateNowPlaying: #{error.message}"


