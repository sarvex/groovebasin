(function(modules) {
    function require(name) {
        if (name in initializedModules) {
            return initializedModules[name];
        }
        return initializedModules[name] = modules[name](require);
    }
    var initializedModules = {};

    for (var name in modules) {
        if (!(name in initializedModules)) {
            modules[name](require);
        }
    }
})({
    "app": function(require) {
var shuffle = require('shuffle');
var humanSize = require('human-size');
var PlayerClient = require('playerclient');
var Socket = require('socket');
var uuid = require('uuid');

var autoDjOn = false;
var hardwarePlaybackOn = false;
var haveAdminUser = true;
var streamEndpoint = null;

var eventsListScrolledToBottom = true;
var isBrowserTabActive = true;

var tryingToStream = false;
var actuallyStreaming = false;
var actuallyPlaying = false;
var stillBuffering = false;
var streamAudio = new Audio();

var selection = {
  ids: {
    queue: {},
    artist: {},
    album: {},
    track: {},
    playlist: {},
    playlistItem: {}
  },
  cursor: null,
  rangeSelectAnchor: null,
  rangeSelectAnchorType: null,
  cursorType: null,
  isLibrary: function(){
    return this.cursorType === 'artist' || this.cursorType === 'album' || this.cursorType === 'track';
  },
  isQueue: function(){
    return this.cursorType === 'queue';
  },
  isPlaylist: function(){
    return this.cursorType === 'playlist' || this.cursorType === 'playlistItem';
  },
  clear: function(){
    this.ids.artist = {};
    this.ids.album = {};
    this.ids.track = {};
    this.ids.queue = {};
    this.ids.playlist = {};
    this.ids.playlistItem = {};
  },
  fullClear: function(){
    this.clear();
    this.cursorType = null;
    this.cursor = null;
    this.rangeSelectAnchor = null;
    this.rangeSelectAnchorType = null;
  },
  selectOne: function(selName, key, selectOnly) {
    if (selectOnly) {
      this.clear();
      this.cursorType = selName;
      this.cursor = key;
      this.rangeSelectAnchor = key;
      this.rangeSelectAnchorType = selName;
    }
    this.ids[selName][key] = true;
  },
  selectOnly: function(selName, key) {
    return selection.selectOne(selName, key, true);
  },
  selectAll: function() {
    this.clear();
    if (selection.isQueue()) {
      selectAllQueue();
    } else if (selection.isLibrary()) {
      selectAllLibrary();
    } else if (selection.isPlaylist()) {
      selectAllPlaylists();
    } else if (player.queue.itemList.length > 0) {
      this.fullClear();
      this.selectOnly('queue', player.queue.itemList[0].id);
      selectAllQueue();
    }
  },
  isAtLeastNumSelected: function(num) {
    var result, k;
    if (this.isLibrary()) {
      result = num;
      for (k in this.ids.artist) {
        if (!--result) return true;
      }
      for (k in this.ids.album) {
        if (!--result) return true;
      }
      for (k in this.ids.track) {
        if (!--result) return true;
      }
      return false;
    } else if (this.isQueue()) {
      result = num;
      for (k in this.ids.queue) {
        if (!--result) return true;
      }
      return false;
    } else if (this.isPlaylist()) {
      result = num;
      for (k in this.ids.playlist) {
        if (!--result) return true;
      }
      for (k in this.ids.playlistItem) {
        if (!--result) return true;
      }
      return false;
    } else {
      return false;
    }
  },
  isMulti: function() {
    return this.isAtLeastNumSelected(2);
  },
  isEmpty: function() {
    return !this.isAtLeastNumSelected(1);
  },
  getPos: function(type, key){
    if (type == null) type = this.cursorType;
    if (key == null) key = this.cursor;
    var val;
    if (this.isLibrary()) {
      val = {
        type: 'library',
        artist: null,
        album: null,
        track: null
      };
      if (key != null) {
        switch (type) {
          case 'track':
            val.track = player.searchResults.trackTable[key];
            val.album = val.track.album;
            val.artist = val.album.artist;
            break;
          case 'album':
            val.album = player.searchResults.albumTable[key];
            val.artist = val.album.artist;
            break;
          case 'artist':
            val.artist = player.searchResults.artistTable[key];
            break;
        }
      } else {
        val.artist = player.searchResults.artistList[0];
      }
    } else if (this.isPlaylist()) {
      val = {
        type: 'playlist',
        playlist: null,
        playlistItem: null
      };
      if (key != null) {
        switch (type) {
          case 'playlistItem':
            val.playlistItem = player.playlistItemTable[key];
            val.playlist = val.playlistItem.playlist;
            break;
          case 'playlist':
            val.playlist = player.playlistTable[key];
            break;
        }
      } else {
        val.playlist = player.playlistList[0];
      }
    } else if (this.isQueue()) {
      val = {
        type: 'queue',
        queue: key ? player.queue.itemTable[key] : player.queue.itemList[0],
      };
    } else {
      throw new Error("NothingSelected");
    }
    return val;
  },
  posToArr: function(pos){
    if (pos.type === 'library') {
      return [
        pos.artist && pos.artist.index,
        pos.album && pos.album.index,
        pos.track && pos.track.index,
      ];
    } else if (pos.type === 'playlist') {
      return [
        pos.playlist && pos.playlist.index,
        pos.playlistItem && pos.playlistItem.index,
      ];
    } else {
      throw new Error("NothingSelected");
    }
  },
  posEqual: function(pos1, pos2){
    var arr1 = this.posToArr(pos1);
    var arr2 = this.posToArr(pos2);
    return compareArrays(arr1, arr2) === 0;
  },
  posInBounds: function(pos){
    if (pos.type === 'library') {
      return pos.artist != null;
    } else if (pos.type === 'playlist') {
      return pos.playlist != null;
    } else if (pos.type === 'queue') {
      return pos.queue != null;
    } else {
      throw new Error("NothingSelected");
    }
  },
  selectOnlyPos: function(pos) {
    return this.selectPos(pos, true);
  },
  selectPos: function(pos, selectOnly) {
    if (pos.type === 'library') {
      if (pos.track) {
        return selection.selectOne('track', pos.track.key, selectOnly);
      } else if (pos.album) {
        return selection.selectOne('album', pos.album.key, selectOnly);
      } else if (pos.artist) {
        return selection.selectOne('artist', pos.artist.key, selectOnly);
      }
    } else if (pos.type === 'playlist') {
      if (pos.playlistItem) {
        return selection.selectOne('playlistItem', pos.playlistItem.id, selectOnly);
      } else if (pos.playlist) {
        return selection.selectOne('playlist', pos.playlist.id, selectOnly);
      }
    } else if (pos.type === 'queue') {
      return selection.selectOne('queue', pos.queue.id, selectOnly);
    } else {
      throw new Error("NothingSelected");
    }
  },
  selectOnlyFirstPos: function(type) {
    if (type === 'library') {
      this.selectOnly('artist', player.searchResults.artistList[0].key);
    } else if (type === 'queue') {
      this.selectOnly('queue', player.queue.itemList[0].id);
    } else if (type === 'playlist') {
      this.selectOnly('playlist', player.playlistList[0].id);
    } else {
      throw new Error("unrecognized type: " + type);
    }
  },
  selectOnlyLastPos: function(type) {
    if (type === 'library') {
      var lastArtist = player.searchResults.artistList[player.searchResults.artistList.length - 1];
      if (isArtistExpanded(lastArtist)) {
        var lastAlbum = lastArtist.albumList[lastArtist.albumList.length - 1];
        if (isAlbumExpanded(lastAlbum)) {
          this.selectOnly('track', lastAlbum.trackList[lastAlbum.trackList.length - 1].key);
        } else {
          this.selectOnly('album', lastAlbum.key);
        }
      } else {
        this.selectOnly('artist', lastArtist.key);
      }
    } else if (type === 'queue') {
      this.selectOnly('queue', player.queue.itemList[player.queue.itemList.length - 1].id);
    } else if (type === 'playlist') {
      var lastPlaylist = player.playlistList[player.playlistList.length - 1];
      if (isPlaylistExpanded(lastPlaylist)) {
        this.selectOnly('playlistItem', lastPlaylist.itemList[lastPlaylist.itemList.length - 1].id);
      } else {
        this.selectOnly('playlist', lastPlaylist.id);
      }
    } else {
      throw new Error("unrecognized type: " + type);
    }
  },
  incrementPos: function(pos){
    if (pos.type === 'library') {
      if (pos.track) {
        pos.track = pos.track.album.trackList[pos.track.index + 1];
        if (!pos.track) {
          pos.album = pos.artist.albumList[pos.album.index + 1];
          if (!pos.album) {
            pos.artist = player.searchResults.artistList[pos.artist.index + 1];
          }
        }
      } else if (pos.album) {
        if (isAlbumExpanded(pos.album)) {
          pos.track = pos.album.trackList[0];
        } else {
          var nextAlbum = pos.artist.albumList[pos.album.index + 1];
          if (nextAlbum) {
            pos.album = nextAlbum;
          } else {
            pos.artist = player.searchResults.artistList[pos.artist.index + 1];
            pos.album = null;
          }
        }
      } else if (pos.artist) {
        if (isArtistExpanded(pos.artist)) {
          pos.album = pos.artist.albumList[0];
        } else {
          pos.artist = player.searchResults.artistList[pos.artist.index + 1];
        }
      }
    } else if (pos.type === 'playlist') {
      if (pos.playlistItem) {
        pos.playlistItem = pos.playlistItem.playlist.itemList[pos.playlistItem.index + 1];
        if (!pos.playlistItem) {
          pos.playlist = player.playlistList[pos.playlist.index + 1];
        }
      } else if (pos.playlist) {
        if (isPlaylistExpanded(pos.playlist)) {
          pos.playlistItem = pos.playlist.itemList[0];
          if (!pos.playlistItem) {
            pos.playlist = player.playlistList[pos.playlist.index + 1];
          }
        } else {
          pos.playlist = player.playlistList[pos.playlist.index + 1];
        }
      }
    } else if (pos.type === 'queue') {
      if (pos.queue) {
        pos.queue = player.queue.itemList[pos.queue.index + 1];
      }
    } else {
      throw new Error("NothingSelected");
    }
  },
  decrementPos: function(pos) {
    if (pos.type === 'library') {
      if (pos.track != null) {
        pos.track = pos.track.album.trackList[pos.track.index - 1];
      } else if (pos.album != null) {
        pos.album = pos.artist.albumList[pos.album.index - 1];
        if (pos.album != null && isAlbumExpanded(pos.album)) {
          pos.track = pos.album.trackList[pos.album.trackList.length - 1];
        }
      } else if (pos.artist != null) {
        pos.artist = player.searchResults.artistList[pos.artist.index - 1];
        if (pos.artist != null && isArtistExpanded(pos.artist)) {
          pos.album = pos.artist.albumList[pos.artist.albumList.length - 1];
          if (pos.album != null && isAlbumExpanded(pos.album)) {
            pos.track = pos.album.trackList[pos.album.trackList.length - 1];
          }
        }
      }
    } else if (pos.type === 'playlist') {
      if (pos.playlistItem) {
        pos.playlistItem = pos.playlistItem.playlist.itemList[pos.playlistItem.index - 1];
      } else if (pos.playlist) {
        pos.playlist = player.playlistList[pos.playlist.index - 1];
        if (pos.playlist && isPlaylistExpanded(pos.playlist)) {
          pos.playlistItem = pos.playlist.itemList[pos.playlist.itemList.length - 1];
        }
      }
    } else if (pos.type === 'queue') {
      if (pos.queue) {
        pos.queue = player.queue.itemList[pos.queue.index - 1];
      }
    } else {
      throw new Error("NothingSelected");
    }
  },
  containsPos: function(pos) {
    if (!this.posInBounds(pos)) return false;
    if (pos.type === 'library') {
      if (pos.track) {
        return this.ids.track[pos.track.key];
      } else if (pos.album) {
        return this.ids.album[pos.album.key];
      } else if (pos.artist) {
        return this.ids.artist[pos.artist.key];
      }
    } else if (pos.type === 'playlist') {
      if (pos.playlistItem) {
        return this.ids.playlistItem[pos.playlistItem.id];
      } else if (pos.playlist) {
        return this.ids.playlist[pos.playlist.id];
      }
    } else if (pos.type === 'queue') {
      return this.ids.queue[pos.queue.id];
    } else {
      throw new Error("NothingSelected");
    }
  },
  toTrackKeys: function(random){
    if (random == null) random = false;
    if (this.isLibrary()) {
      return libraryToTrackKeys();
    } else if (this.isQueue()) {
      return queueToTrackKeys();
    } else if (this.isPlaylist()) {
      return playlistToTrackKeys();
    } else {
      return [];
    }

    function libraryToTrackKeys() {
      var key;
      var trackSet = {};
      for (key in selection.ids.artist) {
        selRenderArtist(player.searchResults.artistTable[key]);
      }
      for (key in selection.ids.album) {
        selRenderAlbum(player.searchResults.albumTable[key]);
      }
      for (key in selection.ids.track) {
        selRenderTrack(player.searchResults.trackTable[key]);
      }
      return getKeysInOrder(trackSet);
      function selRenderArtist(artist){
        for (var i = 0; i < artist.albumList.length; i += 1) {
          var album = artist.albumList[i];
          selRenderAlbum(album);
        }
      }
      function selRenderAlbum(album){
        for (var i = 0; i < album.trackList.length; i += 1) {
          var track = album.trackList[i];
          selRenderTrack(track);
        }
      }
      function selRenderTrack(track){
        trackSet[track.key] = selection.posToArr(getTrackSelPos(track));
      }
      function getTrackSelPos(track){
        return {
          type: 'library',
          artist: track.album.artist,
          album: track.album,
          track: track
        };
      }
    }
    function queueToTrackKeys(){
      var keys = [];
      for (var key in selection.ids.queue) {
        keys.push(player.queue.itemTable[key].track.key);
      }
      if (random) shuffle(keys);
      return keys;
    }
    function playlistToTrackKeys(){
      var playlistItemSet = {};
      function renderPlaylist(playlist){
        for (var i = 0; i < playlist.itemList.length; i += 1) {
          var item = playlist.itemList[i];
          renderPlaylistItem(item);
        }
      }
      function renderPlaylistItem(item){
        playlistItemSet[item.id] = selection.posToArr(getItemSelPos(item));
      }
      function getItemSelPos(item){
        return {
          type: 'playlist',
          playlist: item.playlist,
          playlistItem: item
        };
      }
      for (var key in selection.ids.playlist) {
        renderPlaylist(player.playlistTable[key]);
      }
      for (key in selection.ids.playlistItem) {
        renderPlaylistItem(player.playlistItemTable[key]);
      }
      var playlistItemKeys = getKeysInOrder(playlistItemSet);
      return playlistItemKeys.map(function(playlistItemKey) { return player.playlistItemTable[playlistItemKey].track.key; });
    }

    function getKeysInOrder(trackSet){
      var key;
      var keys = [];
      if (random) {
        for (key in trackSet) {
          keys.push(key);
        }
        shuffle(keys);
        return keys;
      }
      var trackArr = [];
      for (key in trackSet) {
        trackArr.push({
          key: key,
          pos: trackSet[key],
        });
      }
      trackArr.sort(function(a, b) {
        return compareArrays(a.pos, b.pos);
      });
      for (var i = 0; i < trackArr.length; i += 1) {
        var track = trackArr[i];
        keys.push(track.key);
      }
      return keys;
    }
  },
  scrollTo: function() {
    var helpers = this.getHelpers();
    if (!helpers) return;
    if (this.isQueue()) {
      scrollThingToSelection(queueItemsDom, {
        queue: helpers.queue,
      });
    } else if (this.isLibrary()) {
      scrollThingToSelection(libraryDom, {
        track: helpers.track,
        artist: helpers.artist,
        album: helpers.album,
      });
    } else if (this.isPlaylist()) {
      scrollThingToSelection(playlistsListDom, {
        playlist: helpers.playlist,
        playlistItem: helpers.playlistItem,
      });
    }
  },
  scrollToCursor: function() {
    var helpers = this.getHelpers();
    if (!helpers) return;
    if (this.isQueue()) {
      scrollThingToCursor(queueItemsDom, helpers);
    } else if (this.isLibrary()) {
      scrollThingToCursor(libraryDom, helpers);
    } else if (this.isPlaylist()) {
      scrollThingToCursor(playlistsDom, helpers);
    }
  },
  getHelpers: function() {
    if (player == null) return null;
    if (player.queue == null) return null;
    if (player.queue.itemTable == null) return null;
    if (player.searchResults == null) return null;
    if (player.searchResults.artistTable == null) return null;
    return {
      queue: {
        ids: this.ids.queue,
        table: player.queue.itemTable,
        getDiv: function(id) {
          return document.getElementById(toQueueItemId(id));
        },
        toggleExpansion: null,
      },
      artist: {
        ids: this.ids.artist,
        table: player.searchResults.artistTable,
        getDiv: function(id) {
          return document.getElementById(toArtistId(id));
        },
        toggleExpansion: toggleLibraryExpansion,
      },
      album: {
        ids: this.ids.album,
        table: player.searchResults.albumTable,
        getDiv: function(id) {
          return document.getElementById(toAlbumId(id));
        },
        toggleExpansion: toggleLibraryExpansion,
      },
      track: {
        ids: this.ids.track,
        table: player.searchResults.trackTable,
        getDiv: function(id) {
          return document.getElementById(toTrackId(id));
        },
        toggleExpansion: toggleLibraryExpansion,
      },
      playlist: {
        ids: this.ids.playlist,
        table: player.playlistTable,
        getDiv: function(id) {
          return document.getElementById(toPlaylistId(id));
        },
        toggleExpansion: togglePlaylistExpansion,
      },
      playlistItem: {
        ids: this.ids.playlistItem,
        table: player.playlistItemTable,
        getDiv: function(id) {
          return document.getElementById(toPlaylistItemId(id));
        },
        toggleExpansion: togglePlaylistExpansion,
      },
    };
  },
};
var BASE_TITLE = document.title;
var MARGIN = 10;
var AUTO_EXPAND_LIMIT = 30;
var ICON_COLLAPSED = 'icon-triangle-1-e';
var ICON_EXPANDED = 'icon-triangle-1-se';
var myUser = {
  perms: {},
};
var socket = null;
var player = null;
var userIsSeeking = false;
var userIsVolumeSliding = false;
var startedDrag = false;
var abortDrag = noop;
var closeOpenDialog = noop;
var lastFmApiKey = null;
var LoadStatus = {
  Init: 'Loading...',
  NoServer: 'Server is down.',
  GoodToGo: '[good to go]'
};
var repeatModeNames = ["Off", "All", "One"];
var loadStatus = LoadStatus.Init;

var localState = {
  lastfm: {
    username: null,
    session_key: null,
    scrobbling_on: false
  },
  authUsername: null,
  authPassword: null,
  autoQueueUploads: true,
};
var streamBtnDom = document.getElementById('stream-btn');
var streamBtnLabel = document.getElementById('stream-btn-label');
var clientVolDom = document.getElementById('client-vol');
var queueWindowDom = document.getElementById('queue-window');
var leftWindowDom = document.getElementById('left-window');
var queueItemsDom = document.getElementById('queue-items');
var autoDjDom = document.getElementById('auto-dj');
var queueBtnRepeatDom = document.getElementById('queue-btn-repeat');
var tabsDom = document.getElementById('tabs');
var libraryDom = document.getElementById('library');
var libFilterDom = document.getElementById('lib-filter');
var nowPlayingDom = document.getElementById('nowplaying');
var nowPlayingElapsedDom = document.getElementById('nowplaying-time-elapsed');
var nowPlayingLeftDom = document.getElementById('nowplaying-time-left');
var nowPlayingToggleDom = document.getElementById('nowplaying-toggle');
var nowPlayingToggleIconDom = document.getElementById('nowplaying-toggle-icon');
var nowPlayingPrevDom = document.getElementById('nowplaying-prev');
var nowPlayingNextDom = document.getElementById('nowplaying-next');
var nowPlayingStopDom = document.getElementById('nowplaying-stop');
var uploadByUrlDom = document.getElementById('upload-by-url');
var importByNameDom = document.getElementById('import-by-name');
var mainErrMsgDom = document.getElementById('main-err-msg');
var mainErrMsgTextDom = document.getElementById('main-err-msg-text');
var playlistsListDom = document.getElementById('playlists-list');
var playlistsDom = document.getElementById('playlists');
var uploadDom = document.getElementById('upload');
var trackDisplayDom = document.getElementById('track-display');
var libHeaderDom = document.getElementById('lib-window-header');
var queueHeaderDom = document.getElementById('queue-header');
var autoQueueUploadsDom = document.getElementById('auto-queue-uploads');
var uploadInput = document.getElementById("upload-input");
var uploadWidgetDom = document.getElementById('upload-widget');
var settingsRegisterDom = document.getElementById('settings-register');
var settingsShowAuthDom = document.getElementById('settings-show-auth');
var settingsAuthCancelDom = document.getElementById('settings-auth-cancel');
var settingsAuthSaveDom = document.getElementById('settings-auth-save');
var settingsAuthEditDom = document.getElementById('settings-auth-edit');
var settingsAuthRequestDom = document.getElementById('settings-auth-request');
var settingsAuthLogoutDom = document.getElementById('settings-auth-logout');
var streamUrlDom = document.getElementById('settings-stream-url');
var authPermReadDom = document.getElementById('auth-perm-read');
var authPermAddDom = document.getElementById('auth-perm-add');
var authPermControlDom = document.getElementById('auth-perm-control');
var authPermPlaylistDom = document.getElementById('auth-perm-playlist');
var authPermAdminDom = document.getElementById('auth-perm-admin');
var lastFmSignOutDom = document.getElementById('lastfm-sign-out');
var lastFmAuthUrlDom = document.getElementById('lastfm-auth-url');
var settingsLastFmInDom = document.getElementById('settings-lastfm-in');
var settingsLastFmOutDom = document.getElementById('settings-lastfm-out');
var settingsLastFmUserDom = document.getElementById('settings-lastfm-user');
var toggleScrobbleDom = document.getElementById('toggle-scrobble');
var shortcutsDom = document.getElementById('shortcuts');
var editTagsDialogDom = document.getElementById('edit-tags');
var toggleHardwarePlaybackDom = document.getElementById('toggle-hardware-playback');
var newPlaylistNameDom = document.getElementById('new-playlist-name');
var emptyLibraryMessageDom = document.getElementById('empty-library-message');
var libraryNoItemsDom = document.getElementById('library-no-items');
var libraryArtistsDom = document.getElementById('library-artists');
var volNumDom = document.getElementById('vol-num');
var volWarningDom = document.getElementById('vol-warning');
var ensureAdminDiv = document.getElementById('ensure-admin');
var ensureAdminBtn = document.getElementById('ensure-admin-btn');
var authShowPasswordDom = document.getElementById('auth-show-password');
var authUsernameDom = document.getElementById('auth-username');
var authUsernameDisplayDom = document.getElementById('auth-username-display');
var authPasswordDom = document.getElementById('auth-password');
var settingsUsersDom = document.getElementById('settings-users');
var settingsUsersSelect = document.getElementById('settings-users-select');
var settingsRequestsDom = document.getElementById('settings-requests');
var userPermReadDom = document.getElementById('user-perm-read');
var userPermAddDom = document.getElementById('user-perm-add');
var userPermControlDom = document.getElementById('user-perm-control');
var userPermPlaylistDom = document.getElementById('user-perm-playlist');
var userPermAdminDom = document.getElementById('user-perm-admin');
var settingsDelUserDom = document.getElementById('settings-delete-user');
var requestReplaceSelect = document.getElementById('request-replace');
var requestNameDom = document.getElementById('request-name');
var requestApproveDom = document.getElementById('request-approve');
var requestDenyDom = document.getElementById('request-deny');
var eventsOnlineUsersDom = document.getElementById('events-online-users');
var eventsListDom = document.getElementById('events-list');
var chatBoxDom = document.getElementById('chat-box');
var chatBoxInputDom = document.getElementById('chat-box-input');
var queueDurationDom = document.getElementById('queue-duration');
var queueDurationLabel = document.getElementById('queue-duration-label');
var importProgressDom = document.getElementById('import-progress');
var importProgressListDom = document.getElementById('import-progress-list');
var perDom = document.getElementById('edit-tags-per');
var prevDom = document.getElementById('edit-tags-prev');
var nextDom = document.getElementById('edit-tags-next');
var editTagsFocusDom = document.getElementById('edit-tag-name');
var trackSliderDom = document.getElementById('track-slider');
var clientVolSlider = document.getElementById('client-vol-slider');
var volSlider = document.getElementById('vol-slider');
var modalDom = document.getElementById('modal');
var modalContentDom = document.getElementById('modal-content');
var modalTitleDom = document.getElementById('modal-title');
var modalHeaderDom = document.getElementById('modal-header');
var blackoutDom = document.getElementById('blackout');
var contextMenuDom = document.getElementById('context-menu');
var addToPlaylistMenu = document.getElementById('add-to-playlist-menu');
var menuQueue = document.getElementById('menu-queue');
var menuQueueNext = document.getElementById('menu-queue-next');
var menuQueueRandom = document.getElementById('menu-queue-random');
var menuQueueNextRandom = document.getElementById('menu-queue-next-random');
var menuRemove = document.getElementById('menu-remove');
var menuAddToPlaylist = document.getElementById('menu-add-to-playlist');
var menuAddRemoveLabel = document.getElementById('menu-add-remove-label');
var menuShuffle = document.getElementById('menu-shuffle');
var menuDelete = document.getElementById('menu-delete');
var menuDeletePlaylist = document.getElementById('menu-delete-playlist');
var menuRenamePlaylist = document.getElementById('menu-rename-playlist');
var menuDownload = document.getElementById('menu-download');
var menuEditTags = document.getElementById('menu-edit-tags');
var addToPlaylistDialog = document.getElementById('add-to-playlist-dialog');
var addToPlaylistFilter = document.getElementById('add-to-playlist-filter');
var addToPlaylistList = document.getElementById('add-to-playlist-list');
var addToPlaylistNew = document.getElementById('add-to-playlist-new');
var addRemoveLabelDialog = document.getElementById('add-remove-label-dialog');
var addRemoveLabelFilter = document.getElementById('add-remove-label-filter');
var addRemoveLabelList = document.getElementById('add-remove-label-list');
var addRemoveLabelNew = document.getElementById('add-remove-label-new');

var tabs = {
  library: {
    pane: document.getElementById('library-pane'),
    tab: document.getElementById('library-tab'),
  },
  upload: {
    pane: document.getElementById('upload-pane'),
    tab: document.getElementById('upload-tab'),
  },
  playlists: {
    pane: document.getElementById('playlists-pane'),
    tab: document.getElementById('playlists-tab'),
  },
  events: {
    pane: document.getElementById('events-pane'),
    tab: document.getElementById('events-tab'),
  },
  settings: {
    pane: document.getElementById('settings-pane'),
    tab: document.getElementById('settings-tab'),
  },
};
var activeTab = tabs.library;
var triggerRenderLibrary = makeRenderCall(renderLibrary, 100);
var triggerRenderQueue = makeRenderCall(renderQueue, 100);
var triggerPlaylistsUpdate = makeRenderCall(updatePlaylistsUi, 100);
var triggerLabelsUpdate = makeRenderCall(updateLabelsUi, 100);
var triggerResize = makeRenderCall(resizeDomElements, 20);
var keyboardHandlers = (function() {
  var volumeDownHandler = {
      ctrl: false,
      alt: false,
      shift: null,
      handler: function() {
        bumpVolume(-0.1);
      }
  };
  var volumeUpHandler = {
      ctrl: false,
      alt: false,
      shift: null,
      handler: function() {
        bumpVolume(0.1);
      }
  };

  return {
    // Enter
    13: {
      ctrl: false,
      alt: null,
      shift: null,
      handler: function(ev) {
        if (selection.isQueue()) {
          player.seek(selection.cursor, 0);
          player.play();
        } else {
          queueSelection(ev);
        }
      },
    },
    // Escape
    27: {
      ctrl: false,
      alt: false,
      shift: false,
      handler: function(){
        if (startedDrag) {
          abortDrag();
          return;
        }
        if (removeContextMenu()) return;
        selection.fullClear();
        refreshSelection();
      },
    },
    // Space
    32: {
      ctrl: null,
      alt: false,
      shift: false,
      handler: function(ev) {
        if (ev.ctrlKey) {
          toggleSelectionUnderCursor();
          refreshSelection();
        } else {
          togglePlayback();
        }
      },
    },
    // Left
    37: {
      ctrl: null,
      alt: false,
      shift: null,
      handler: leftRightHandler,
    },
    // Up
    38: {
      ctrl: null,
      alt: null,
      shift: null,
      handler: upDownHandler,
    },
    // Right
    39: {
      ctrl: null,
      alt: false,
      shift: null,
      handler: leftRightHandler,
    },
    // Down
    40: {
      ctrl: null,
      alt: null,
      shift: null,
      handler: upDownHandler,
    },
    // Delete
    46: {
      ctrl: false,
      alt: false,
      shift: null,
      handler: function(ev) {
        if ((havePerm('admin') && ev.shiftKey) ||
           (havePerm('control') && !ev.shiftKey))
        {
          handleDeletePressed(ev.shiftKey);
        }
      },
    },
    // =
    61: volumeUpHandler,
    // a
    65: {
      ctrl: null,
      alt: false,
      shift: false,
      handler: function(ev) {
        if (ev.ctrlKey) {
          selection.selectAll();
          refreshSelection();
        } else {
          onAddToPlaylistContextMenu(ev);
        }
      },
    },
    // d
    68: {
      ctrl: false,
      alt: false,
      shift: false,
      handler: toggleAutoDj,
    },
    // e, E
    69: {
      ctrl: false,
      alt: false,
      shift: null,
      handler: function(ev) {
        if (ev.shiftKey) {
          onEditTagsContextMenu(ev);
        } else {
          clickTab(tabs.settings);
        }
      },
    },
    // H
    72: {
      ctrl: false,
      alt: false,
      shift: true,
      handler: onShuffleContextMenu,
    },
    // l
    76: {
      ctrl: false,
      alt: false,
      shift: false,
      handler: function(ev) {
        onAddRemoveLabelContextMenu(ev);
      },
    },
    // p
    80: {
      ctrl: false,
      alt: false,
      shift: false,
      handler: function() {
        clickTab(tabs.playlists);
        newPlaylistNameDom.focus();
        newPlaylistNameDom.select();
      },
    },
    // r, R
    82: {
      ctrl: false,
      alt: false,
      shift: null,
      handler: function(ev) {
        if (ev.shiftKey) {
          maybeRenamePlaylistAtCursor();
        } else {
          nextRepeatState();
        }
      },
    },
    // s
    83: {
      ctrl: false,
      alt: false,
      shift: false,
      handler: toggleStreamStatusEvent
    },
    // t
    84: {
      ctrl: false,
      alt: false,
      shift: false,
      handler: function() {
        clickTab(tabs.events);
        chatBoxInputDom.focus();
        chatBoxInputDom.select();
        scrollEventsToBottom();
      },
    },
    // i
    73: {
      ctrl: false,
      alt: false,
      shift: false,
      handler: function() {
        clickTab(tabs.upload);
        uploadByUrlDom.focus();
        uploadByUrlDom.select();
      },
    },
    // - maybe?
    173: volumeDownHandler,
    // +
    187: volumeUpHandler,
    // , <
    188: {
      ctrl: false,
      alt: false,
      shift: true,
      handler: function() {
        player.prev();
      },
    },
    // _ maybe?
    189: volumeDownHandler,
    // . >
    190: {
      ctrl: false,
      alt: false,
      shift: true,
      handler: function() {
        player.next();
      },
    },
    // ?
    191: {
      ctrl: false,
      alt: false,
      shift: null,
      handler: function(ev) {
        if (ev.shiftKey) {
          showKeyboardShortcuts(ev);
        } else {
          clickTab(tabs.library);
          libFilterDom.focus();
          libFilterDom.select();
          selection.fullClear();
          refreshSelection();
        }
      },
    },
  };

  function upDownHandler(ev) {
    var defaultIndex, dir, nextPos;
    if (ev.which === 38) {
      // up
      defaultIndex = player.currentItem ? player.currentItem.index - 1 : player.queue.itemList.length - 1;
      dir = -1;
    } else {
      // down
      defaultIndex = player.currentItem ? player.currentItem.index + 1 : 0;
      dir = 1;
    }
    if (defaultIndex >= player.queue.itemList.length) {
      defaultIndex = player.queue.itemList.length - 1;
    } else if (defaultIndex < 0) {
      defaultIndex = 0;
    }
    if (ev.altKey) {
      if (selection.isQueue()) {
        player.shiftIds(selection.ids.queue, dir);
      } else if (selection.isPlaylist()) {
        player.playlistShiftIds(selection.ids.playlistItem, dir);
      }
    } else {
      if (selection.isQueue()) {
        nextPos = player.queue.itemTable[selection.cursor].index + dir;
        if (nextPos < 0 || nextPos >= player.queue.itemList.length) {
          return;
        }
        selection.cursor = player.queue.itemList[nextPos].id;
        if (!ev.ctrlKey && !ev.shiftKey) {
          // select single
          selection.selectOnly(selection.cursorType, selection.cursor);
        } else if (!ev.ctrlKey && ev.shiftKey) {
          // select range
          selectQueueRange();
        } else {
          // ghost selection
          selection.rangeSelectAnchor = selection.cursor;
          selection.rangeSelectAnchorType = selection.cursorType;
        }
      } else if (selection.isLibrary()) {
        nextPos = selection.getPos();
        if (dir > 0) {
          selection.incrementPos(nextPos);
        } else {
          selection.decrementPos(nextPos);
        }
        if (nextPos.artist == null) return;
        if (nextPos.track != null) {
          selection.cursorType = 'track';
          selection.cursor = nextPos.track.key;
        } else if (nextPos.album != null) {
          selection.cursorType = 'album';
          selection.cursor = nextPos.album.key;
        } else {
          selection.cursorType = 'artist';
          selection.cursor = nextPos.artist.key;
        }
        if (!ev.ctrlKey && !ev.shiftKey) {
          // select single
          selection.selectOnly(selection.cursorType, selection.cursor);
        } else if (!ev.ctrlKey && ev.shiftKey) {
          // select range
          selectTreeRange();
        } else {
          // ghost selection
          selection.rangeSelectAnchor = selection.cursor;
          selection.rangeSelectAnchorType = selection.cursorType;
        }
      } else if (selection.isPlaylist()) {
        nextPos = selection.getPos();
        if (dir > 0) {
          selection.incrementPos(nextPos);
        } else {
          selection.decrementPos(nextPos);
        }
        if (!nextPos.playlist) return;
        if (nextPos.playlistItem) {
          selection.cursorType = 'playlistItem';
          selection.cursor = nextPos.playlistItem.id;
        } else {
          selection.cursorType = 'playlist';
          selection.cursor = nextPos.playlist.id;
        }
        if (!ev.ctrlKey && !ev.shiftKey) {
          selection.selectOnly(selection.cursorType, selection.cursor);
        } else if (!ev.ctrlKey && ev.shiftKey) {
          selectTreeRange();
        } else {
          selection.rangeSelectAnchor = selection.cursor;
          selection.rangeSelectAnchorType = selection.cursorType;
        }
      } else {
        if (player.queue.itemList.length === 0) return;
        selection.selectOnly('queue', player.queue.itemList[defaultIndex].id);
      }
      refreshSelection();
    }
    selection.scrollToCursor();
  }

  function leftRightHandler(ev) {
    var dir = ev.which === 37 ? -1 : 1;
    var helpers = selection.getHelpers();
    if (!helpers) return;
    var helper = helpers[selection.cursorType];
    if (helper && helper.toggleExpansion) {
      var selectedItem = helper.table[selection.cursor];
      var isExpandedFuncs = {
        artist: isArtistExpanded,
        album: isAlbumExpanded,
        track: alwaysTrue,
        playlist: isPlaylistExpanded,
        playlistItem: alwaysTrue,
      };
      var isExpanded = isExpandedFuncs[selection.cursorType](selectedItem);
      var li = helper.getDiv(selection.cursor).parentNode;
      if (dir > 0) {
        if (!isExpanded) {
          helper.toggleExpansion(li);
        }
      } else {
        if (isExpanded) {
          helper.toggleExpansion(li);
        }
      }
    } else {
      if (ev.ctrlKey) {
        if (dir > 0) {
          player.next();
        } else {
          player.prev();
        }
      } else if (ev.shiftKey) {
        if (!player.currentItem) return;
        player.seek(null, getCurrentTrackPosition() + dir * player.currentItem.track.duration * 0.10);
      } else {
        player.seek(null, getCurrentTrackPosition() + dir * 10);
      }
    }
  }
})();

var editTagsTrackKeys = null;
var editTagsTrackIndex = null;

var EDITABLE_PROPS = {
  name: {
    type: 'string',
    write: true,
  },
  artistName: {
    type: 'string',
    write: true,
  },
  albumArtistName: {
    type: 'string',
    write: true,
  },
  albumName: {
    type: 'string',
    write: true,
  },
  compilation: {
    type: 'boolean',
    write: true,
  },
  track: {
    type: 'integer',
    write: true,
  },
  trackCount: {
    type: 'integer',
    write: true,
  },
  disc: {
    type: 'integer',
    write: true,
  },
  discCount: {
    type: 'integer',
    write: true,
  },
  year: {
    type: 'integer',
    write: true,
  },
  genre: {
    type: 'string',
    write: true,
  },
  composerName: {
    type: 'string',
    write: true,
  },
  performerName: {
    type: 'string',
    write: true,
  },
  file: {
    type: 'string',
    write: false,
  },
};
var EDIT_TAG_TYPES = {
  'string': {
    get: function(domItem) {
      return domItem.value;
    },
    set: function(domItem, value) {
      domItem.value = value || "";
    },
  },
  'integer': {
    get: function(domItem) {
      var n = parseInt(domItem.value, 10);
      if (isNaN(n)) return null;
      return n;
    },
    set: function(domItem, value) {
      domItem.value = value == null ? "" : value;
    },
  },
  'boolean': {
    get: function(domItem) {
      return domItem.checked;
    },
    set: function(domItem, value) {
      domItem.checked = !!value;
    },
  },
};
var chatCommands = {
  nick: changeUserName,
  me: displaySlashMe,
};
var escapeHtmlReplacements = { "&": "&amp;", '"': "&quot;", "<": "&lt;", ">": "&gt;" };

var eventTypeMessageFns = {
  autoDj: function(ev) {
    return "toggled Auto DJ";
  },
  autoPause: function(ev) {
    return "auto pause because nobody is listening";
  },
  chat: function(ev, flags) {
    flags.safe = true;
    return linkify(escapeHtml(ev.text));
  },
  clearQueue: function(ev) {
    return "cleared the queue";
  },
  connect: function(ev) {
    return "connected";
  },
  currentTrack: function(ev) {
    return "Now playing: " + getEventNowPlayingText(ev);
  },
  import: function(ev) {
    var prefix = ev.user ? "imported " : "anonymous user imported ";
    if (ev.pos > 1) {
      return prefix + ev.pos + " tracks";
    } else {
      return prefix + getEventNowPlayingText(ev);
    }
  },
  labelCreate: function(ev) {
    return "created " + eventLabelName(ev);
  },
  labelRename: function(ev) {
    return "renamed " + eventLabelName(ev, ev.text) + " to " + eventLabelName(ev);
  },
  labelColorUpdate: function(ev) {
    if (ev.label) {
      return "changed color of " + eventLabelName(ev) + " from " + ev.text + " to " + ev.label.color;
    } else {
      return "changed color of (deleted label)";
    }
  },
  labelDelete: function(ev) {
    return "deleted " + eventLabelName(ev, ev.text);
  },
  labelAdd: function(ev) {
    if (ev.pos === 1) {
      if (ev.subCount === 1) {
        return "added " + eventLabelName(ev) + " to " + getEventNowPlayingText(ev);
      } else {
        return "added labels to " + getEventNowPlayingText(ev);
      }
    } else {
      return "added labels to " + ev.pos + " tracks";
    }
  },
  labelRemove: function(ev) {
    if (ev.pos === 1) {
      if (ev.subCount === 1) {
        return "removed " + eventLabelName(ev) + " from " + getEventNowPlayingText(ev);
      } else {
        return "removed labels from " + getEventNowPlayingText(ev);
      }
    } else {
      return "removed labels from " + ev.pos + " tracks";
    }
  },
  login: function(ev) {
    return "logged in";
  },
  move: function(ev) {
    return "moved queue items";
  },
  part: function(ev) {
    return "disconnected";
  },
  pause: function(ev) {
    return "pressed pause";
  },
  play: function(ev) {
    return "pressed play";
  },
  playlistAddItems: function(ev) {
    if (ev.pos === 1) {
      return "added " + getEventNowPlayingText(ev) + " to " + eventPlaylistName(ev);
    } else {
      return "added " + ev.pos + " tracks to " + eventPlaylistName(ev);
    }
  },
  playlistCreate: function(ev) {
    return "created " + eventPlaylistName(ev);
  },
  playlistDelete: function(ev) {
    return "deleted playlist " + ev.text;
  },
  playlistMoveItems: function(ev) {
    if (ev.playlist) {
      return "moved " + ev.pos + " tracks in " + eventPlaylistName(ev);
    } else {
      return "moved " + ev.pos + " tracks in playlists";
    }
  },
  playlistRemoveItems: function(ev) {
    if (ev.playlist) {
      if (ev.pos === 1) {
        return "removed " + getEventNowPlayingText(ev) + " from " + eventPlaylistName(ev);
      } else {
        return "removed " + ev.pos + " tracks from " + eventPlaylistName(ev);
      }
    } else {
      return "removed " + ev.pos + " tracks from playlists";
    }
  },
  playlistRename: function(ev) {
    var name = ev.playlist ? ev.playlist.name : "(Deleted Playlist)";
    return "renamed playlist " + ev.text + " to " + name;
  },
  queue: function(ev) {
    if (ev.pos === 1) {
      return "added to the queue: " + getEventNowPlayingText(ev);
    } else {
      return "added " + ev.pos + " tracks to the queue";
    }
  },
  remove: function(ev) {
    if (ev.pos === 1) {
      return "removed from the queue: " + getEventNowPlayingText(ev);
    } else {
      return "removed " + ev.pos + " tracks from the queue";
    }
  },
  register: function(ev) {
    return "registered";
  },
  seek: function(ev) {
    if (ev.pos === 0) {
      return "chose a different song";
    } else {
      return "seeked to " + formatTime(ev.pos);
    }
  },
  shuffle: function(ev) {
    return "shuffled the queue";
  },
  stop: function(ev) {
    return "pressed stop";
  },
  streamStart: function(ev) {
    if (ev.user) {
      return "started streaming";
    } else {
      return "anonymous user started streaming";
    }
  },
  streamStop: function(ev) {
    if (ev.user) {
      return "stopped streaming";
    } else {
      return "anonymous user stopped streaming";
    }
  },
};
var searchTimer = null;

var menuPermSelectors = {
  admin: [menuDelete, menuEditTags],
  control: [menuRemove, menuShuffle, menuQueue, menuQueueNext, menuQueueRandom, menuQueueNextRandom],
  playlist: [menuDeletePlaylist, menuAddToPlaylist, menuAddRemoveLabel],
};

var addToPlaylistDialogFilteredList = [];
var addRemoveLabelDialogFilteredList = [];

init();

function saveLocalState(){
  localStorage.setItem('state', JSON.stringify(localState));
}

function loadLocalState() {
  var stateString = localStorage.getItem('state');
  if (!stateString) return;
  var obj;
  try {
    obj = JSON.parse(stateString);
  } catch (err) {
    return;
  }
  // this makes sure it still works when we change the format of localState
  for (var key in localState) {
    if (obj[key] !== undefined) {
      localState[key] = obj[key];
    }
  }
}

function selectAllQueue() {
  player.queue.itemList.forEach(function(item) {
    selection.ids.queue[item.id] = true;
  });
}

function selectAllLibrary() {
  player.searchResults.artistList.forEach(function(artist) {
    selection.ids.artist[artist.key] = true;
  });
}

function selectAllPlaylists() {
  player.playlistList.forEach(function(playlist) {
    selection.ids.playlist[playlist.id] = true;
  });
}

function scrollThingToCursor(scrollArea, helpers) {
  var helper = helpers[selection.cursorType];
  var div = helper.getDiv(selection.cursor);
  var itemTop = div.getBoundingClientRect().top;
  var itemBottom = itemTop + div.clientHeight;
  scrollAreaIntoView(scrollArea, itemTop, itemBottom);
}

function scrollAreaIntoView(scrollArea, itemTop, itemBottom) {
  var scrollAreaTop = scrollArea.getBoundingClientRect().top;
  var selectionTop = itemTop - scrollAreaTop;
  var selectionBottom = itemBottom - scrollAreaTop - scrollArea.clientHeight;
  var scrollAmt = scrollArea.scrollTop;
  if (selectionTop < 0) {
    scrollArea.scrollTop = scrollAmt + selectionTop;
  } else if (selectionBottom > 0) {
    scrollArea.scrollTop = scrollAmt + selectionBottom;
  }
}

function scrollThingToSelection(scrollArea, helpers){
  var topPos = null;
  var bottomPos = null;

  var helper;
  for (var selName in helpers) {
    helper = helpers[selName];
    for (var id in helper.ids) {
      var div = helper.getDiv(id);
      var itemTop = div.getBoundingClientRect().top;
      var itemBottom = itemTop + div.clientHeight;
      if (topPos == null || itemTop < topPos) {
        topPos = itemTop;
      }
      if (bottomPos == null || itemBottom > bottomPos) {
        bottomPos = itemBottom;
      }
    }
  }

  if (topPos != null) {
    scrollAreaIntoView(scrollArea, topPos, bottomPos);
  }
}

function getDragPosition(x, y) {
  var result = {};
  var plItemDom = queueItemsDom.querySelectorAll(".pl-item");
  for (var i = 0; i < plItemDom.length; ++i) {
    var item = plItemDom[i];
    var middle = item.getBoundingClientRect().top + item.clientHeight / 2;
    var track = player.queue.itemTable[item.getAttribute('data-id')];
    if (middle < y) {
      if (result.previousKey == null || track.sortKey > result.previousKey) {
        result.previous = item;
        result.previousKey = track.sortKey;
      }
    } else {
      if (result.nextKey == null || track.sortKey < result.nextKey) {
        result.next = item;
        result.nextKey = track.sortKey;
      }
    }
  }
  return result;
}

function renderAutoDj() {
  if (autoDjOn) {
    autoDjDom.classList.add('on');
  } else {
    autoDjDom.classList.remove('on');
  }
}

function renderQueueButtons() {
  renderAutoDj();
  var repeatModeName = repeatModeNames[player.repeat];

  queueBtnRepeatDom.value = "Repeat: " + repeatModeName;
  if (player.repeat === PlayerClient.REPEAT_OFF) {
    queueBtnRepeatDom.classList.remove("on");
  } else {
    queueBtnRepeatDom.classList.add("on");
  }
}

function updateHaveAdminUserUi() {
  ensureAdminDiv.style.display = haveAdminUser ? "none" : "";
}

function renderQueue() {
  var itemList = player.queue.itemList || [];
  var scrollTop = queueItemsDom.scrollTop;

  // add the missing dom entries
  var i;
  for (i = queueItemsDom.childElementCount; i < itemList.length; i += 1) {
    queueItemsDom.insertAdjacentHTML('beforeend',
      '<div class="pl-item">' +
        '<span class="track"></span>' +
        '<span class="time"></span>' +
        '<span class="middle">' +
          '<span class="title"></span>' +
          '<span class="artist"></span>' +
          '<span class="album"></span>' +
        '</span>' +
      '</div>');
  }
  // remove the extra dom entries
  while (itemList.length < queueItemsDom.childElementCount) {
    queueItemsDom.removeChild(queueItemsDom.lastChild);
  }

  // overwrite existing dom entries
  var domItems = queueItemsDom.children;
  for (i = 0; i < itemList.length; i += 1) {
    var domItem = domItems[i];
    var item = itemList[i];
    domItem.setAttribute('id', toQueueItemId(item.id));
    domItem.setAttribute('data-id', item.id);
    var track = item.track;
    domItem.children[0].textContent = track.track || "";

    var timeText = player.isScanning(track) ? "scan" : formatTime(track.duration);
    domItem.children[1].textContent = timeText;

    var middleDom = domItem.children[2];
    middleDom.children[0].textContent = track.name || "";
    middleDom.children[1].textContent = track.artistName || "";
    middleDom.children[2].textContent = track.albumName || "";

    var trackLabels = getTrackLabels(track);
    for (var label_i = trackLabels.length - 1; label_i >= 0; label_i -= 1) {
      var label = trackLabels[label_i];
      var labelBoxDom = document.createElement('span');
      var targetDom = middleDom.children[0];
      labelBoxDom.classList.add("label-box");
      labelBoxDom.style.backgroundColor = label.color;
      labelBoxDom.setAttribute('title', label.name);
      targetDom.insertBefore(labelBoxDom, targetDom.firstChild);
    }
  }

  refreshSelection();
  labelQueueItems();
  queueItemsDom.scrollTop = scrollTop;
}

function getTrackLabels(track) {
  var labelList = Object.keys(track.labels).map(getLabelById);
  labelList.sort(compareNameAndId);
  return labelList;
}

function compareNameAndId(a, b) {
  var result = operatorCompare(a.name, b.name);
  if (result) return result;
  return operatorCompare(a.id, b.id);
}

function operatorCompare(a, b){
  if (a === b) {
    return 0;
  } else if (a > b) {
    return -1;
  } else {
    return 1;
  }
}

function getLabelById(labelId) {
  return player.library.labelTable[labelId];
}

function updateQueueDuration() {
  var duration = 0;
  var allAreKnown = true;

  if (selection.isQueue()) {
    selection.toTrackKeys().forEach(addKeyDuration);
    queueDurationLabel.textContent = "Selection:";
  } else {
    player.queue.itemList.forEach(addItemDuration);
    queueDurationLabel.textContent = "Play Queue:";
  }
  queueDurationDom.textContent = formatTime(duration) + (allAreKnown ? "" : "?");

  function addKeyDuration(key) {
    var track = player.library.trackTable[key];
    if (track) {
      addDuration(track);
    }
  }
  function addItemDuration(item) {
    addDuration(item.track);
  }
  function addDuration(track) {
    duration += Math.max(0, track.duration);
    if (player.isScanning(track)) {
      allAreKnown = false;
    }
  }
}

function removeCurrentOldAndRandomClasses(domItem) {
  domItem.classList.remove('current');
  domItem.classList.remove('old');
  domItem.classList.remove('random');
}

function labelQueueItems() {
  var item, domItem;
  var curItem = player.currentItem;
  Array.prototype.forEach.call(queueItemsDom.getElementsByClassName('pl-item'), removeCurrentOldAndRandomClasses);
  if (curItem != null && autoDjOn) {
    for (var index = 0; index < curItem.index; ++index) {
      item = player.queue.itemList[index];
      var itemId = item && item.id;
      if (itemId) {
        domItem = document.getElementById(toQueueItemId(itemId));
        if (domItem) {
          domItem.classList.add('old');
        }
      }
    }
  }
  for (var i = 0; i < player.queue.itemList.length; i += 1) {
    item = player.queue.itemList[i];
    if (item.isRandom) {
      domItem = document.getElementById(toQueueItemId(item.id));
      if (domItem) {
        domItem.classList.add('random');
      }
    }
  }
  if (curItem) {
    domItem = document.getElementById(toQueueItemId(curItem.id));
    if (domItem) {
      domItem.classList.add('current');
    }
  }
}

function refreshSelection() {
  var helpers = selection.getHelpers();
  if (!helpers) {
    updateQueueDuration();
    return;
  }
  [queueItemsDom, libraryArtistsDom, playlistsListDom].forEach(function(domElement) {
    ['selected', 'cursor'].forEach(function(className) {
      var elementList = domElement.getElementsByClassName(className);
      for (var i = elementList.length - 1; i >= 0; i--) {
        elementList[i].classList.remove(className);
      }
    });
  });

  if (selection.cursorType == null) {
    updateQueueDuration();
    return;
  }
  for (var selectionType in helpers) {
    var helper = helpers[selectionType];
    var id;
    // clean out stale ids
    for (id in helper.ids) {
      if (helper.table[id] == null) {
        delete helper.ids[id];
      }
    }
    for (id in helper.ids) {
      var selectedDomItem = helper.getDiv(id);
      if (selectedDomItem) {
        selectedDomItem.classList.add('selected');
      }
    }
    if (selection.cursor != null && selectionType === selection.cursorType) {
      var validIds = getValidIds(selectionType);
      if (validIds[selection.cursor] == null) {
        // server just deleted our current cursor item.
        // select another of our ids randomly, if we have any.
        selection.cursor = Object.keys(helper.ids)[0];
        selection.rangeSelectAnchor = selection.cursor;
        selection.rangeSelectAnchorType = selectionType;
        if (selection.cursor == null) {
          // no selected items
          selection.fullClear();
        }
      }
      if (selection.cursor != null) {
        var cursorDomItem = helper.getDiv(selection.cursor);
        if (cursorDomItem) {
          cursorDomItem.classList.add('cursor');
        }
      }
    }
  }
  updateQueueDuration();

}

function getValidIds(selectionType) {
  switch (selectionType) {
    case 'queue':  return player.queue.itemTable;
    case 'artist': return player.library.artistTable;
    case 'album':  return player.library.albumTable;
    case 'track':  return player.library.trackTable;
    case 'playlist':  return player.playlistTable;
    case 'playlistItem':  return player.playlistItemTable;
  }
  throw new Error("BadSelectionType");
}

function artistDisplayName(name) {
  return name || '[Unknown Artist]';
}

function makeRenderCall(renderFn, interval) {
  var renderTimeout = null;
  var renderWanted = false;

  return ensureRenderHappensSoon;

  function ensureRenderHappensSoon() {
    if (renderTimeout) {
      renderWanted = true;
      return;
    }

    renderFn();
    renderWanted = false;
    renderTimeout = setTimeout(checkRender, interval);
  }

  function checkRender() {
    renderTimeout = null;
    if (renderWanted) {
      ensureRenderHappensSoon();
    }
  }
}

function updatePlaylistsUi() {
  renderPlaylists();
  updateAddToPlaylistDialogDisplay();
}

function updateLabelsUi() {
  updateAddRemoveLabelDialogDisplay();
}

function popAddToPlaylistDialog() {
  popDialog(addToPlaylistDialog, "Add to Playlist", 400, Math.min(500, window.innerHeight - 40));
  addToPlaylistFilter.focus();
  addToPlaylistFilter.select();
}

function popAddRemoveLabelDialog() {
  popDialog(addRemoveLabelDialog, "Add/Remove Labels", 400, Math.min(500, window.innerHeight - 40));
  addRemoveLabelFilter.focus();
  addRemoveLabelFilter.select();
}

function updateAddToPlaylistDialogDisplay() {
  var loweredFilter = addToPlaylistFilter.value.toLowerCase();
  addToPlaylistDialogFilteredList = [];
  var exactMatch = false;
  player.playlistList.forEach(function(playlist) {
    if (playlist.name.toLowerCase().indexOf(loweredFilter) >= 0) {
      addToPlaylistDialogFilteredList.push(playlist);
      if (addToPlaylistFilter.value === playlist.name) {
        exactMatch = true;
      }
    }
  });

  addToPlaylistNew.textContent = "\"" + addToPlaylistFilter.value + "\" (create new)";
  addToPlaylistNew.style.display = (exactMatch || loweredFilter === "") ? "none" : "";


  // add the missing dom entries
  var i;
  for (i = addToPlaylistList.childElementCount; i < addToPlaylistDialogFilteredList.length; i += 1) {
    addToPlaylistList.appendChild(document.createElement('li'));
  }
  // remove the extra dom entries
  while (addToPlaylistDialogFilteredList.length < addToPlaylistList.childElementCount) {
    addToPlaylistList.removeChild(addToPlaylistList.lastChild);
  }

  // overwrite existing dom entries
  for (i = 0; i < addToPlaylistDialogFilteredList.length; i += 1) {
    var domItem = addToPlaylistList.children[i];
    var playlist = addToPlaylistDialogFilteredList[i];
    domItem.setAttribute('data-key', playlist.id);
    domItem.textContent = playlist.name;
  }
}

function renderPlaylists() {
  var playlistList = player.playlistList;
  var scrollTop = playlistsDom.scrollTop;

  // add the missing dom entries
  var i;
  for (i = playlistsListDom.childElementCount; i < playlistList.length; i += 1) {
    playlistsListDom.insertAdjacentHTML('beforeend',
      '<li>' +
        '<div class="clickable expandable" data-type="playlist">' +
          '<div class="icon"></div>' +
          '<span></span>' +
        '</div>' +
        '<ul></ul>' +
      '</li>');
  }
  // remove the extra dom entries
  while (playlistList.length < playlistsListDom.childElementCount) {
    playlistsListDom.removeChild(playlistsListDom.lastChild);
  }

  // overwrite existing dom entries
  var playlist;
  var domItems = playlistsListDom.children;
  for (i = 0; i < playlistList.length; i += 1) {
    var domItem = domItems[i];
    playlist = playlistList[i];
    domItem.setAttribute('data-cached', "");
    var divDom = domItem.children[0];
    divDom.setAttribute('id', toPlaylistId(playlist.id));
    divDom.setAttribute('data-key', playlist.id);
    var iconDom = divDom.children[0];
    iconDom.classList.add(ICON_COLLAPSED);
    iconDom.classList.remove(ICON_EXPANDED);
    var spanDom = divDom.children[1];
    spanDom.textContent = playlist.name;
    var ulDom = domItem.children[1];
    ulDom.style.display = 'block';
    while (ulDom.firstChild) {
      ulDom.removeChild(ulDom.firstChild);
    }
  }

  playlistsDom.scrollTop = scrollTop;
  refreshSelection();
  expandPlaylistsToSelection();
}

function renderLibrary() {
  var artistList = player.searchResults.artistList || [];
  var scrollTop = libraryDom.scrollTop;

  emptyLibraryMessageDom.textContent = player.haveFileListCache ? "No Results" : "loading...";
  libraryNoItemsDom.style.display = artistList.length ? "none" : "";

  // add the missing dom entries
  var i;
  for (i = libraryArtistsDom.childElementCount; i < artistList.length; i += 1) {
    libraryArtistsDom.insertAdjacentHTML('beforeend',
      '<li>' +
        '<div class="clickable expandable" data-type="artist">' +
          '<div class="icon"></div>' +
          '<span></span>' +
        '</div>' +
        '<ul></ul>' +
      '</li>');
  }
  // remove the extra dom entries
  while (artistList.length < libraryArtistsDom.childElementCount) {
    libraryArtistsDom.removeChild(libraryArtistsDom.lastChild);
  }

  // overwrite existing dom entries
  var artist;
  var domItems = libraryArtistsDom.children;
  for (i = 0; i < artistList.length; i += 1) {
    var domItem = domItems[i];
    artist = artistList[i];
    domItem.setAttribute('data-cached', "");
    var divDom = domItem.children[0];
    divDom.setAttribute('id', toArtistId(artist.key));
    divDom.setAttribute('data-key', artist.key);
    var iconDom = divDom.children[0];
    iconDom.classList.add(ICON_COLLAPSED);
    iconDom.classList.remove(ICON_EXPANDED);
    var spanDom = divDom.children[1];
    spanDom.textContent = artistDisplayName(artist.name);
    var ulDom = domItem.children[1];
    ulDom.style.display = 'block';
    while (ulDom.firstChild) {
      ulDom.removeChild(ulDom.firstChild);
    }
  }

  var nodeCount = artistList.length;
  expandStuff(domItems);
  libraryDom.scrollTop = scrollTop;
  refreshSelection();
  expandLibraryToSelection();

  function expandStuff(liSet) {
    if (nodeCount >= AUTO_EXPAND_LIMIT) return;
    for (var i = 0; i < liSet.length; i += 1) {
      var li = liSet[i];
      if (nodeCount <= AUTO_EXPAND_LIMIT) {
        var ul = li.children[1];
        if (!ul) continue;
        toggleLibraryExpansion(li);
        nodeCount += ul.children.length;
        expandStuff(ul.children);
      }
    }
  }
}

function getCurrentTrackPosition(){
  if (player.trackStartDate != null && player.isPlaying === true) {
    return (new Date() - player.trackStartDate) / 1000;
  } else {
    return player.pausedTime;
  }
}

function updateSliderPos() {
  if (userIsSeeking) return;

  var duration, disabled, elapsed, sliderPos;
  if (player.currentItem && player.isPlaying != null && player.currentItem.track) {
    disabled = false;
    elapsed = getCurrentTrackPosition();
    duration = player.currentItem.track.duration;
    sliderPos = elapsed / duration;
  } else {
    disabled = true;
    elapsed = duration = sliderPos = 0;
  }

  trackSliderDom.disabled = disabled;
  trackSliderDom.value = sliderPos;
  updateSliderUi();

  nowPlayingElapsedDom.textContent = formatTime(elapsed);
  nowPlayingLeftDom.textContent = formatTime(duration);
}

function renderVolumeSlider() {
  if (userIsVolumeSliding) return;

  volSlider.value = player.volume;
  volNumDom.textContent = Math.round(player.volume * 100);
  volWarningDom.style.display = (player.volume > 1) ? "" : "none";
}

function getNowPlayingText(track) {
  if (!track) {
    return "(Deleted Track)";
  }
  var str = track.name + " - " + track.artistName;
  if (track.albumName) {
    str += " - " + track.albumName;
  }
  return str;
}

function renderNowPlaying() {
  var track = null;
  if (player.currentItem != null) {
    track = player.currentItem.track;
  }

  updateTitle();
  if (track) {
    trackDisplayDom.textContent = getNowPlayingText(track);
  } else {
    trackDisplayDom.innerHTML = "&nbsp;";
  }
  var oldClass = (player.isPlaying === true) ? 'icon-play' : 'icon-pause';
  var newClass = (player.isPlaying === true) ? 'icon-pause': 'icon-play';
  nowPlayingToggleIconDom.classList.remove(oldClass);
  nowPlayingToggleIconDom.classList.add(newClass);
  trackSliderDom.disabled = (player.isPlaying == null);
  updateSliderPos();
  renderVolumeSlider();
}

function render() {
  var hideMainErr = (loadStatus === LoadStatus.GoodToGo);
  queueWindowDom.style.display= hideMainErr ? "" : "none";
  leftWindowDom.style.display = hideMainErr ? "" : "none";
  nowPlayingDom.style.display = hideMainErr ? "" : "none";
  mainErrMsgDom.style.display = hideMainErr ? "none" : "";
  if (!hideMainErr) {
    document.title = BASE_TITLE;
    mainErrMsgTextDom.textContent = loadStatus;
    return;
  }
  renderQueueButtons();
  renderLibrary();
  renderNowPlaying();
  updateSettingsAuthUi();
  updateLastFmSettingsUi();
  resizeDomElements();
}

function renderArtist(ul, albumList) {
  albumList.forEach(function(album) {
    ul.insertAdjacentHTML('beforeend',
      '<li>' +
        '<div class="clickable expandable" data-type="album">' +
          '<div class="icon icon-triangle-1-e"></div>' +
          '<span></span>' +
        '</div>' +
        '<ul style="display: none;"></ul>' +
      '</li>');
    var liDom = ul.lastChild;
    var divDom = liDom.children[0];
    divDom.setAttribute('id', toAlbumId(album.key));
    divDom.setAttribute('data-key', album.key);
    var spanDom = divDom.children[1];
    spanDom.textContent = album.name || '[Unknown Album]';

    var artistUlDom = liDom.children[1];
    album.trackList.forEach(function(track) {
      artistUlDom.insertAdjacentHTML('beforeend',
        '<li>' +
          '<div class="clickable" data-type="track">' +
            '<span></span>' +
          '</div>' +
        '</li>');
      var trackLiDom = artistUlDom.lastChild;
      var trackDivDom = trackLiDom.children[0];
      trackDivDom.setAttribute('id', toTrackId(track.key));
      trackDivDom.setAttribute('data-key', track.key);
      var trackSpanDom = trackDivDom.children[0];
      var caption = "";
      if (track.track) {
        caption += track.track + ". ";
      }
      if (track.compilation) {
        caption += track.artistName + " - ";
      }
      caption += track.name;
      trackSpanDom.textContent = caption;
    });
  });
}

function renderPlaylist(ul, playlist) {
  playlist.itemList.forEach(function(item) {
    ul.insertAdjacentHTML('beforeend',
      '<li>' +
        '<div class="clickable" data-type="playlistItem">' +
          '<span></span>' +
        '</div>' +
      '</li>');
    var liDom = ul.lastChild;
    var divDom = liDom.children[0];
    divDom.setAttribute('id', toPlaylistItemId(item.id));
    divDom.setAttribute('data-key', item.id);
    var spanDom = divDom.children[0];
    var track = item.track;
    var caption = track.artistName + " - " + track.name;
    spanDom.textContent = caption;
  });
}

function isDomItemVisible(domItem) {
  // only works if the domItem is not position absolute or fixed
  return domItem.offsetParent !== null;
}

function toggleDisplay(domItem) {
  domItem.style.display = isDomItemVisible(domItem) ? "none" : "";
}

function genericToggleExpansion(li, options) {
  var topLevelType = options.topLevelType;
  var renderDom = options.renderDom;
  var div = li.children[0];
  var ul = li.children[1];
  if (div.getAttribute('data-type') === topLevelType &&
      !li.getAttribute('data-cached'))
  {
    li.setAttribute('data-cached', "1");
    var key = div.getAttribute('data-key');
    renderDom(ul, key);
    refreshSelection();
  } else {
    toggleDisplay(ul);
  }
  var isVisible = isDomItemVisible(ul);
  var oldClass = isVisible ? ICON_COLLAPSED : ICON_EXPANDED;
  var newClass = isVisible ? ICON_EXPANDED  : ICON_COLLAPSED;
  div.children[0].classList.remove(oldClass);
  div.children[0].classList.add(newClass);
}

function toggleLibraryExpansion(li) {
  genericToggleExpansion(li, {
    topLevelType: 'artist',
    renderDom: function(ul, key) {
      var albumList = player.searchResults.artistTable[key].albumList;
      renderArtist(ul, albumList);
    },
  });
}

function togglePlaylistExpansion(li) {
  genericToggleExpansion(li, {
    topLevelType: 'playlist',
    renderDom: function(ul, key) {
      var playlist = player.playlistTable[key];
      renderPlaylist(ul, playlist);
    },
  });
}

function maybeDeleteTracks(keysList) {
  var fileList = keysList.map(function(key) {
    return player.library.trackTable[key].file;
  });
  var listText = fileList.slice(0, 7).join("\n  ");
  if (fileList.length > 7) {
    listText += "\n  ...";
  }
  var songText = fileList.length === 1 ? "song" : "songs";
  var message = "You are about to delete " + fileList.length + " " + songText + " permanently:\n\n  " + listText;
  if (!confirm(message)) return false;
  assumeCurrentSelectionIsDeleted();
  player.deleteTracks(keysList);
  return true;
}

function assumeCurrentSelectionIsDeleted() {
  var nextPos = selection.getPos();
  while (selection.containsPos(nextPos)) {
    selection.incrementPos(nextPos);
  }
  selection.clear();
  if (selection.posInBounds(nextPos)) {
    selection.selectOnlyPos(nextPos);
  }
}

function handleDeletePressed(shift) {
  var keysList;
  if (selection.isLibrary()) {
    keysList = selection.toTrackKeys();
    maybeDeleteTracks(keysList);
  } else if (selection.isPlaylist()) {
    if (shift) {
      keysList = selection.toTrackKeys();
      if (maybeDeleteTracks(keysList)) {
        player.deletePlaylists(selection.ids.playlist);
      }
    } else {
      var table = extend({}, selection.ids.playlistItem);
      for (var playlistId in selection.ids.playlist) {
        var playlist = player.playlistTable[playlistId];
        for (var itemId in playlist.itemTable) {
          table[itemId] = true;
        }
      }
      assumeCurrentSelectionIsDeleted();
      player.removeItemsFromPlaylists(table);
    }
  } else if (selection.isQueue()) {
    if (shift) {
      keysList = [];
      for (var id in selection.ids.queue) {
        keysList.push(player.queue.itemTable[id].track.key);
      }
      maybeDeleteTracks(keysList);
    } else {
      var idsToRemove = Object.keys(selection.ids.queue);
      assumeCurrentSelectionIsDeleted();
      player.removeIds(idsToRemove);
    }
  }
}

function nobodyListening() {
  return getStreamerCount() === 0 && !hardwarePlaybackOn;
}

function togglePlayback(){
  if (player.isPlaying === true) {
    player.pause();
  } else if (player.isPlaying === false) {
    if (nobodyListening()) {
      toggleStreamStatus();
    }
    player.play();
  }
  // else we haven't received state from server yet
}

function toggleAutoDj(){
  autoDjOn = !autoDjOn;
  player.sendCommand('autoDjOn', autoDjOn);
  renderAutoDj();
}

function nextRepeatState(ev) {
  player.setRepeatMode((player.repeat + 1) % repeatModeNames.length);
}

function bumpVolume(v) {
  if (tryingToStream) {
    setStreamVolume(streamAudio.volume + v);
  } else {
    player.setVolume(player.volume + v);
  }
}

function removeContextMenu() {
  if (contextMenuDom.style.display !== 'none') {
    contextMenuDom.style.display = "none";
    return true;
  }
  return false;
}

function isPlaylistExpanded(playlist){
  var li = document.getElementById(toPlaylistId(playlist.id)).parentNode;
  if (!li.getAttribute('data-cached')) return false;
  return isDomItemVisible(li.lastChild);
}

function isArtistExpanded(artist){
  var li = document.getElementById(toArtistId(artist.key)).parentNode;
  if (!li.getAttribute('data-cached')) return false;
  return isDomItemVisible(li.lastChild);
}

function isAlbumExpanded(album){
  var albumElem = document.getElementById(toAlbumId(album.key));
  var li = albumElem.parentNode;
  return isDomItemVisible(li.lastChild);
}

function expandArtist(artist) {
  if (isArtistExpanded(artist)) return;

  var artistElem = document.getElementById(toArtistId(artist.key));
  var li = artistElem.parentNode;
  toggleLibraryExpansion(li);
}

function expandAlbum(album) {
  if (isAlbumExpanded(album)) return;

  expandArtist(album.artist);
  var elem = document.getElementById(toAlbumId(album.key));
  var li = elem.parentNode;
  toggleLibraryExpansion(li);
}

function expandPlaylist(playlist) {
  if (isPlaylistExpanded(playlist)) return;

  var playlistElem = document.getElementById(toPlaylistId(playlist.id));
  var li = playlistElem.parentNode;
  togglePlaylistExpansion(li);
}

function expandPlaylistsToSelection() {
  if (!selection.isPlaylist()) return;

  for (var itemId in selection.ids.playlistItem) {
    var playlist = player.playlistItemTable[itemId].playlist;
    expandPlaylist(playlist);
  }

  selection.scrollTo();
}

function expandLibraryToSelection() {
  if (!selection.isLibrary()) return;
  for (var trackKey in selection.ids.track) {
    var track = player.library.trackTable[trackKey];
    expandAlbum(track.album);
  }
  for (var albumKey in selection.ids.album) {
    var album = player.library.albumTable[albumKey];
    expandArtist(album.artist);
  }
  selection.scrollTo();
}

function queueSelection(ev) {
  var keys = selection.toTrackKeys(ev.altKey);
  if (ev.shiftKey) {
    player.queueTracksNext(keys);
  } else {
    player.queueOnQueue(keys);
  }
}

function toggleSelectionUnderCursor() {
  var key = selection.cursor;
  var type = selection.cursorType;
  if (selection.ids[type][key] != null) {
    delete selection.ids[type][key];
  } else {
    selection.ids[type][key] = true;
  }
}

function selectQueueRange() {
  selection.clear();
  var anchor = selection.rangeSelectAnchor;
  if (anchor == null) anchor = selection.cursor;
  var minPos = player.queue.itemTable[anchor].index;
  var maxPos = player.queue.itemTable[selection.cursor].index;
  if (maxPos < minPos) {
    var tmp = minPos;
    minPos = maxPos;
    maxPos = tmp;
  }
  for (var i = minPos; i <= maxPos; i++) {
    selection.ids.queue[player.queue.itemList[i].id] = true;
  }
}
function selectTreeRange() {
  selection.clear();
  var oldPos = selection.getPos(selection.rangeSelectAnchorType, selection.rangeSelectAnchor);
  var newPos = selection.getPos(selection.cursorType, selection.cursor);
  if (compareArrays(selection.posToArr(oldPos), selection.posToArr(newPos)) > 0) {
    var tmp = oldPos;
    oldPos = newPos;
    newPos = tmp;
  }
  while (selection.posInBounds(oldPos)) {
    selection.selectPos(oldPos);
    if (selection.posEqual(oldPos, newPos)) {
      break;
    }
    selection.incrementPos(oldPos);
  }
}

function sendAuth() {
  if (!localState.authPassword || !localState.authUsername) return;
  socket.send('login', {
    username: localState.authUsername,
    password: localState.authPassword,
  });
}

function settingsAuthSave(ev) {
  localState.authUsername = authUsernameDom.value;
  localState.authPassword = authPasswordDom.value;
  saveLocalState();
  sendAuth();
  hideShowAuthEdit(false);
}

function changeUserName(username) {
  if (!username) return false;
  localState.authUsername = username;
  saveLocalState();
  sendAuth();
  return true;
}

function settingsAuthCancel(ev) {
  hideShowAuthEdit(false);
}

function hideShowAuthEdit(visible) {
  settingsRegisterDom.style.display = visible ? "" : "none";
  settingsShowAuthDom.style.display = visible ? "none" : "";
}

function removeAllQueueItemBorders() {
  Array.prototype.forEach.call(queueItemsDom.getElementsByClassName('pl-item'), function(domItem) {
    domItem.classList.remove('border-top');
    domItem.classList.remove('border-bottom');
  });
}

function performDrag(ev, callbacks) {
  abortDrag();
  var startDragX = ev.pageX;
  var startDragY = ev.pageY;
  abortDrag = doAbortDrag;
  window.addEventListener('mousemove', onDragMove, false);
  window.addEventListener('mouseup', onDragEnd, false);
  onDragMove(ev);

  function doAbortDrag() {
    window.removeEventListener('mousemove', onDragMove, false);
    window.removeEventListener('mouseup', onDragEnd, false);
    if (startedDrag) {
      removeAllQueueItemBorders();
      startedDrag = false;
    }
    abortDrag = noop;
  }
  function onDragMove(ev){
    var dist, result;
    if (!startedDrag) {
      dist = Math.pow(ev.pageX - startDragX, 2) + Math.pow(ev.pageY - startDragY, 2);
      if (dist > 64) {
        startedDrag = true;
      }
      if (!startedDrag) {
        return;
      }
    }
    result = getDragPosition(ev.pageX, ev.pageY);
    removeAllQueueItemBorders();
    if (result.next) {
      result.next.classList.add('border-top');
    } else if (result.previous) {
      result.previous.classList.add('border-bottom');
    }
  }
  function onDragEnd(ev) {
    if (ev.which !== 1) {
      ev.preventDefault();
      ev.stopPropagation();
      return;
    }
    if (startedDrag) {
      callbacks.complete(getDragPosition(ev.pageX, ev.pageY), ev);
    } else {
      callbacks.cancel();
    }
    abortDrag();
  }
}

function isDialogOpen() {
  return closeOpenDialog !== noop;
}

function clearSelectionAndHideMenu() {
  if (isDialogOpen()) return;
  removeContextMenu();
  selection.fullClear();
  refreshSelection();
}

function onWindowKeyDown(ev) {
  var handler = keyboardHandlers[ev.which];
  if (handler == null) return;
  if (handler.ctrl  != null && handler.ctrl  !== ev.ctrlKey)  return;
  if (handler.alt   != null && handler.alt   !== ev.altKey)   return;
  if (handler.shift != null && handler.shift !== ev.shiftKey) return;
  ev.preventDefault();
  ev.stopPropagation();
  handler.handler(ev);
}

function onShortcutsWindowKeyDown(ev) {
  ev.stopPropagation();
  if (ev.which === 27) {
    closeOpenDialog();
  }
}

function callCloseOpenDialog() {
  closeOpenDialog();
}

function onBlackoutKeyDown(ev) {
  if (ev.which === 27) {
    closeOpenDialog();
  }
}

function setUpGenericUi() {
  window.addEventListener('focus', onWindowFocus, false);
  window.addEventListener('blur', onWindowBlur, false);
  window.addEventListener('resize', triggerResize, false);
  window.addEventListener('mousedown', clearSelectionAndHideMenu, false);
  window.addEventListener('keydown', onWindowKeyDown, false);
  streamAudio.addEventListener('playing', onStreamPlaying, false);
  shortcutsDom.addEventListener('keydown', onShortcutsWindowKeyDown, false);
  document.getElementById('modal-close').addEventListener('click', callCloseOpenDialog, false);
  blackoutDom.addEventListener('keydown', onBlackoutKeyDown, false);
  blackoutDom.addEventListener('mousedown', callCloseOpenDialog, false);

  modalDom.addEventListener('keydown', onModalKeyDown, false);

  addToPlaylistFilter.addEventListener('keydown', onAddToPlaylistFilterKeyDown, false);
  addToPlaylistFilter.addEventListener('keyup', updateAddToPlaylistDialogDisplay, false);
  addToPlaylistFilter.addEventListener('cut', updateAddToPlaylistDialogDisplay, false);
  addToPlaylistFilter.addEventListener('paste', updateAddToPlaylistDialogDisplay, false);
  addToPlaylistNew.addEventListener('mousedown', onAddToPlaylistNewClick, false);
  addToPlaylistList.addEventListener('mousedown', onAddToPlaylistListClick, false);

  addRemoveLabelFilter.addEventListener('keydown', onAddRemoveLabelFilterKeyDown, false);
  addRemoveLabelFilter.addEventListener('keyup', updateAddRemoveLabelDialogDisplay, false);
  addRemoveLabelFilter.addEventListener('cut', updateAddRemoveLabelDialogDisplay, false);
  addRemoveLabelFilter.addEventListener('paste', updateAddRemoveLabelDialogDisplay, false);
  addRemoveLabelNew.addEventListener('mousedown', onAddRemoveLabelNewClick, false);
  addRemoveLabelList.addEventListener('mousedown', onAddRemoveLabelListClick, false);
  addRemoveLabelList.addEventListener('change', onAddRemoveLabelListChange, false);
}

function onModalKeyDown(ev) {
  ev.stopPropagation();
  switch (ev.which) {
  case 27: // Escape
    ev.preventDefault();
    closeOpenDialog();
    return;
  }
}

function onAddToPlaylistListClick(ev) {
  if (ev.button !== 0) return;
  ev.stopPropagation();
  ev.preventDefault();
  var clickedLi = getFirstChildToward(addToPlaylistList, ev.target);
  if (!clickedLi) return;
  if (!havePerm('playlist')) return;
  if (!ev.shiftKey) closeOpenDialog();
  var playlistId = clickedLi.getAttribute('data-key');
  player.queueOnPlaylist(playlistId, selection.toTrackKeys());
}

function onAddToPlaylistNewClick(ev) {
  ev.stopPropagation();
  ev.preventDefault();
  if (!havePerm('playlist')) return;
  if (!ev.shiftKey) closeOpenDialog();
  var playlist = player.createPlaylist(addToPlaylistFilter.value);
  player.queueOnPlaylist(playlist.id, selection.toTrackKeys());
}

function onAddToPlaylistFilterKeyDown(ev) {
  ev.stopPropagation();
  switch (ev.which) {
  case 27: // Escape
    ev.preventDefault();
    if (addToPlaylistFilter.value === "") {
      closeOpenDialog();
    } else {
      addToPlaylistFilter.value = "";
    }
    return;
  case 13: // Enter
    ev.preventDefault();
    if (addToPlaylistDialogFilteredList.length === 0) {
      onAddToPlaylistNewClick(ev);
    } else {
      var playlistId = addToPlaylistDialogFilteredList[0].id;
      player.queueOnPlaylist(playlistId, selection.toTrackKeys());
      if (!ev.shiftKey) {
        closeOpenDialog();
      }
    }
    return;
  }
}

function onAddRemoveLabelFilterKeyDown(ev) {
  ev.stopPropagation();
  switch (ev.which) {
  case 27: // Escape
    ev.preventDefault();
    if (addRemoveLabelFilter.value === "") {
      closeOpenDialog();
    } else {
      addRemoveLabelFilter.value = "";
    }
    return;
  case 13: // Enter
    ev.preventDefault();
    if (addRemoveLabelDialogFilteredList.length === 0) {
      onAddRemoveLabelNewClick(ev);
    } else {
      var labelId = addRemoveLabelDialogFilteredList[0].id;
      toggleLabelOnSelection(labelId);
      if (!ev.shiftKey) {
        closeOpenDialog();
      }
    }
    return;
  }
}

function updateAddRemoveLabelDialogDisplay(ev) {
  var loweredFilter = addRemoveLabelFilter.value.toLowerCase();
  addRemoveLabelDialogFilteredList = [];
  var exactMatch = false;
  player.library.labelList.forEach(function(label) {
    if (label.name.toLowerCase().indexOf(loweredFilter) >= 0) {
      addRemoveLabelDialogFilteredList.push(label);
      if (addRemoveLabelFilter.value === label.name) {
        exactMatch = true;
      }
    }
  });

  addRemoveLabelNew.textContent = "\"" + addRemoveLabelFilter.value + "\" (create new)";
  addRemoveLabelNew.style.display = (exactMatch || loweredFilter === "") ? "none" : "";


  // add the missing dom entries
  var i;
  for (i = addRemoveLabelList.childElementCount; i < addRemoveLabelDialogFilteredList.length; i += 1) {
    addRemoveLabelList.insertAdjacentHTML('beforeend',
      '<div class="label-dialog-item">' +
        '<input type="checkbox" class="label-dialog-checkbox">' +
        '<button class="button label-dialog-trash">' +
          '<label class="icon icon-trash"></label>' +
        '</button>' +
        '<button class="button label-dialog-rename">' +
          '<label class="icon icon-tag"></label>' +
        '</button>' +
        '<input type="color" class="label-dialog-color"></span>' +
        '<span class="label-dialog-name"></span>' +
      '</div>');
  }
  // remove the extra dom entries
  while (addRemoveLabelDialogFilteredList.length < addRemoveLabelList.childElementCount) {
    addRemoveLabelList.removeChild(addRemoveLabelList.lastChild);
  }

  var selectedTracks = selection.toTrackKeys().map(function(key) {
    return player.library.trackTable[key];
  });

  // overwrite existing dom entries
  for (i = 0; i < addRemoveLabelDialogFilteredList.length; i += 1) {
    var domItem = addRemoveLabelList.children[i];
    var labelDomItem = domItem.children[4];
    var label = addRemoveLabelDialogFilteredList[i];
    domItem.setAttribute('data-key', label.id);
    labelDomItem.textContent = label.name;

    var colorDomItem = domItem.children[3];
    colorDomItem.value = label.color;

    var checkboxDom = domItem.children[0];
    var allHaveLabel = true;
    var allMissingLabel = true;
    for (var track_i = 0; track_i < selectedTracks.length; track_i += 1) {
      var selectedTrack = selectedTracks[track_i];
      if (selectedTrack.labels[label.id]) {
        allMissingLabel = false;
      } else {
        allHaveLabel = false;
      }
    }
    if (allHaveLabel) {
      checkboxDom.checked = true;
      checkboxDom.indeterminate = false;
    } else if (allMissingLabel) {
      checkboxDom.checked = false;
      checkboxDom.indeterminate = false;
    } else {
      checkboxDom.checked = false;
      checkboxDom.indeterminate = true;
    }
  }
}

function onAddRemoveLabelListChange(ev) {
  ev.stopPropagation();
  ev.preventDefault();

  var clickedItem = getFirstChildToward(addRemoveLabelList, ev.target);
  if (!clickedItem) return;
  if (!havePerm('playlist')) return;
  var labelId = clickedItem.getAttribute('data-key');

  if (ev.target.classList.contains('label-dialog-color')) {
    player.updateLabelColor(labelId, ev.target.value);
  } else if (ev.target.classList.contains('label-dialog-checkbox')) {
    toggleLabelOnSelection(labelId);
  }
}

function onAddRemoveLabelListClick(ev) {
  if (ev.button !== 0) return;

  ev.stopPropagation();
  ev.preventDefault();

  var clickedItem = getFirstChildToward(addRemoveLabelList, ev.target);
  if (!clickedItem) return;
  if (!havePerm('playlist')) return;
  var labelId = clickedItem.getAttribute('data-key');
  var label = player.library.labelTable[labelId];

  var target = ev.target;
  if (target.tagName === 'LABEL') {
    target = target.parentNode;
  }

  if (target.classList.contains('label-dialog-trash')) {
      if (!confirm("You are about to delete the label \"" + label.name + "\"")) {
        return;
      }
      player.deleteLabels([labelId]);
  } else if (target.classList.contains('label-dialog-rename')) {
    var newName = prompt("Rename label \"" + label.name + "\" to:", label.name);
    player.renameLabel(labelId, newName);
  } else if (!ev.target.classList.contains("label-dialog-color") &&
             !ev.target.classList.contains("label-dialog-checkbox"))
  {
    var keepOpen = ev.shiftKey;
    if (!keepOpen) closeOpenDialog();

    toggleLabelOnSelection(labelId);

  }
}

function toggleLabelOnSelection(labelId) {
  var selectionTrackKeys = selection.toTrackKeys();
  var selectedTracks = selectionTrackKeys.map(function(key) {
    return player.library.trackTable[key];
  });

  var allHaveLabel = true;
  for (var track_i = 0; track_i < selectedTracks.length; track_i += 1) {
    var selectedTrack = selectedTracks[track_i];
    if (!selectedTrack.labels[labelId]) {
      allHaveLabel = false;
      break;
    }
  }
  if (allHaveLabel) {
    player.removeLabel(labelId, selectionTrackKeys);
  } else {
    player.addLabel(labelId, selectionTrackKeys);
  }
}

function onAddRemoveLabelNewClick(ev) {
  ev.stopPropagation();
  ev.preventDefault();
  if (!havePerm('playlist')) return;
  if (!ev.shiftKey) closeOpenDialog();
  var label = player.createLabel(addRemoveLabelFilter.value);
  player.addLabel(label.id, selection.toTrackKeys());
}

function handleAutoDjClick(ev) {
  toggleAutoDj();
  ev.preventDefault();
  ev.stopPropagation();
}

function getFirstChildToward(parentDom, childDom) {
  if (childDom === parentDom) return null;
  for (;;) {
    var nextNode = childDom.parentNode;
    if (nextNode === parentDom) return childDom;
    childDom = nextNode;
  }
}

function firstElemWithClass(parentDom, className, childDom) {
  for (;;) {
    if (childDom.classList.contains(className)) {
      return childDom;
    }
    childDom = childDom.parentNode;
    if (!childDom || parentDom === childDom) {
      return null;
    }
  }
}

function onQueueItemsDblClick(ev) {
  var clickedPlItem = getFirstChildToward(queueItemsDom, ev.target);
  if (!clickedPlItem) return;

  var trackId = clickedPlItem.getAttribute('data-id');
  player.seek(trackId, 0);
  player.play();
}

function onQueueItemsContextMenu(ev) {
  if (ev.target === queueItemsDom) return;
  if (ev.altKey) return;
  ev.preventDefault();
  ev.stopPropagation();
}

function onQueueItemsMouseDown(ev) {
  var clickedPlItem = getFirstChildToward(queueItemsDom, ev.target);
  if (!clickedPlItem) return;
  if (startedDrag) return;
  ev.preventDefault();
  ev.stopPropagation();
  document.activeElement.blur();
  var trackId, skipDrag;
  if (ev.which === 1) {
    removeContextMenu();
    trackId = clickedPlItem.getAttribute('data-id');
    skipDrag = false;
    if (!selection.isQueue()) {
      selection.selectOnly('queue', trackId);
    } else if (ev.ctrlKey || ev.shiftKey) {
      skipDrag = true;
      if (ev.shiftKey && !ev.ctrlKey) {
        // range select click
        selection.cursor = trackId;
        selectQueueRange();
      } else if (!ev.shiftKey && ev.ctrlKey) {
        // individual item selection toggle
        selection.cursor = trackId;
        selection.rangeSelectAnchor = trackId;
        selection.rangeSelectAnchorType = selection.cursorType;
        toggleSelectionUnderCursor();
      }
    } else if (selection.ids.queue[trackId] == null) {
      selection.selectOnly('queue', trackId);
    }
    refreshSelection();
    if (!skipDrag) {
      performDrag(ev, {
        complete: function(result, ev){
          var delta, id;
          delta = {
            top: 0,
            bottom: 1
          };
          player.moveIds(Object.keys(selection.ids.queue), result.previousKey, result.nextKey);
        },
        cancel: function(){
          selection.selectOnly('queue', trackId);
          refreshSelection();
        }
      });
    }
  } else if (ev.which === 3) {
    if (ev.altKey) return;
    trackId = clickedPlItem.getAttribute('data-id');
    if (!selection.isQueue() || selection.ids.queue[trackId] == null) {
      selection.selectOnly('queue', trackId);
      refreshSelection();
    }
    popContextMenu('queue', ev.pageX, ev.pageY);
  }
}

function setUpPlayQueueUi() {
  queueBtnRepeatDom.addEventListener('click', nextRepeatState, false);
  autoDjDom.addEventListener('click', handleAutoDjClick, false);

  queueItemsDom.addEventListener('dblclick', onQueueItemsDblClick, false);
  queueItemsDom.addEventListener('contextmenu', onQueueItemsContextMenu, false);
  queueItemsDom.addEventListener('mousedown', onQueueItemsMouseDown, false);
}

function popContextMenu(type, x, y) {
  removeContextMenu();

  menuDeletePlaylist.style.display = (type === 'playlist') ? "" : "none";
  menuRenamePlaylist.style.display = (type === 'playlist') ? "" : "none";
  if (type === 'playlistItem') {
    menuRemove.style.display = "";
    menuRemove.firstChild.textContent = "Remove from Playlist";
  } else if (type === 'playlist') {
    menuRemove.style.display = "";
    menuRemove.firstChild.textContent = "Clear Playlist";
  } else if (type === 'queue') {
    menuRemove.style.display = "";
    menuRemove.firstChild.textContent = "Remove from Queue";
  } else {
    menuRemove.style.display = "none";
  }

  menuShuffle.style.display =
    (type === 'playlist' || type === 'playlistItem' || type === 'queue') ? "" : "none";

  menuDownload.firstChild.setAttribute('href', makeDownloadHref());
  updateMenuDisableState(contextMenuDom);

  // must make it visible for width and height properties to exist
  contextMenuDom.style.display = "";

  // make it so that the mouse cursor is not immediately over the menu
  var leftPos = x + 1;
  var topPos = y + 1;
  // avoid menu going outside document boundaries
  if (leftPos + contextMenuDom.offsetWidth >= window.innerWidth) {
    leftPos = x - contextMenuDom.offsetWidth - 1;
  }
  if (topPos + contextMenuDom.offsetHeight >= window.innerHeight) {
    topPos = y - contextMenuDom.offsetHeight - 1;
  }
  contextMenuDom.style.left = leftPos + "px";
  contextMenuDom.style.top = topPos + "px";
}

function onShuffleContextMenu(ev) {
  ev.preventDefault();
  ev.stopPropagation();
  if (!selection.cursor || selection.isQueue()) {
    var ids = Object.keys(selection.ids.queue);
    if (ids.length === 0) {
      ids = Object.keys(player.queue.itemTable);
    }
    player.shuffleQueueItems(ids);
  } else if (selection.isPlaylist()) {
    if (selection.cursorType === 'playlistItem') {
      player.shufflePlaylistItems(selection.ids.playlistItem);
    } else if (selection.cursorType === 'playlist') {
      player.shufflePlaylists(selection.ids.playlist);
    }
  }
  removeContextMenu();
}

function onNewPlaylistNameKeyDown(ev) {
  ev.stopPropagation();

  if (ev.which === 27) {
    newPlaylistNameDom.value = "";
    newPlaylistNameDom.blur();
  } else if (ev.which === 13) {
    var name = newPlaylistNameDom.value.trim();
    if (name.length > 0) {
      player.createPlaylist(name);
      newPlaylistNameDom.value = "";
    }
  } else if (ev.which === 40) {
    // down
    selection.selectOnlyFirstPos('playlist');
    selection.scrollToCursor();
    refreshSelection();
    newPlaylistNameDom.blur();
  } else if (ev.which === 38) {
    // up
    selection.selectOnlyLastPos('playlist');
    selection.scrollToCursor();
    refreshSelection();
    newPlaylistNameDom.blur();
  }
}

function setUpPlaylistsUi() {
  newPlaylistNameDom.addEventListener('keydown', onNewPlaylistNameKeyDown, false);

  genericTreeUi(playlistsListDom, {
    toggleExpansion: togglePlaylistExpansion,
    isSelectionOwner: function() {
      return selection.isPlaylist();
    },
  });
}

function stopPropagation(ev) {
  ev.stopPropagation();
}

function onDownloadContextMenu(ev) {
  removeContextMenu();
}

function onDeleteContextMenu(ev) {
  ev.preventDefault();
  ev.stopPropagation();
  if (!havePerm('admin')) return;
  removeContextMenu();
  handleDeletePressed(true);
}

function onEditTagsContextMenu(ev) {
  ev.preventDefault();
  ev.stopPropagation();
  if (!havePerm('admin')) return;
  if (selection.isEmpty()) return;
  removeContextMenu();
  editTagsTrackKeys = selection.toTrackKeys();
  editTagsTrackIndex = 0;
  showEditTags();
}

function updateEditTagsUi() {
  var multiple = editTagsTrackKeys.length > 1;
  prevDom.disabled = !isBtnOn(perDom) || editTagsTrackIndex === 0;
  nextDom.disabled = !isBtnOn(perDom) || (editTagsTrackIndex === editTagsTrackKeys.length - 1);
  prevDom.style.visibility = multiple ? 'visible' : 'hidden';
  nextDom.style.visibility = multiple ? 'visible' : 'hidden';
  perDom.style.visibility = multiple ? 'visible' : 'hidden';
  var multiCheckBoxVisible = multiple && !isBtnOn(perDom);
  var trackKeysToUse = isBtnOn(perDom) ? [editTagsTrackKeys[editTagsTrackIndex]] : editTagsTrackKeys;

  for (var propName in EDITABLE_PROPS) {
    var propInfo = EDITABLE_PROPS[propName];
    var type = propInfo.type;
    var setter = EDIT_TAG_TYPES[type].set;
    var domItem = document.getElementById('edit-tag-' + propName);
    domItem.readOnly = !propInfo.write;
    var multiCheckBoxDom = document.getElementById('edit-tag-multi-' + propName);
    multiCheckBoxDom.style.visibility = (multiCheckBoxVisible && propInfo.write) ? 'visible' : 'hidden';
    var commonValue = null;
    var consistent = true;
    for (var i = 0; i < trackKeysToUse.length; i += 1) {
      var key = trackKeysToUse[i];
      var track = player.library.trackTable[key];
      var value = track[propName];
      if (commonValue == null) {
        commonValue = value;
      } else if (commonValue !== value) {
        consistent = false;
        break;
      }
    }
    multiCheckBoxDom.checked = consistent;
    setter(domItem, consistent ? commonValue : null);
  }
}

function showEditTags() {
  popDialog(editTagsDialogDom, "Edit Tags", 650, Math.min(640, window.innerHeight - 40));
  updateBtnOn(perDom, false);
  updateEditTagsUi();
  editTagsFocusDom.focus();
  editTagsFocusDom.select();
}

function setUpEditTagsUi() {
  Array.prototype.forEach.call(editTagsDialogDom.getElementsByTagName("input"), function(domItem) {
    domItem.addEventListener('keydown', onInputKeyDown, false);
  });
  for (var propName in EDITABLE_PROPS) {
    var domItem = document.getElementById('edit-tag-' + propName);
    var multiCheckBoxDom = document.getElementById('edit-tag-multi-' + propName);
    var listener = createChangeListener(multiCheckBoxDom);
    domItem.addEventListener('change', listener, false);
    domItem.addEventListener('keypress', listener, false);
    domItem.addEventListener('focus', onFocus, false);
  }

  function onInputKeyDown(ev) {
    ev.stopPropagation();
    if (ev.which === 27) {
      closeOpenDialog();
    } else if (ev.which === 13) {
      saveAndClose();
    }
  }

  function onFocus(ev) {
    editTagsFocusDom = ev.target;
  }

  function createChangeListener(multiCheckBoxDom) {
    return function() {
      multiCheckBoxDom.checked = true;
    };
  }

  function togglePerTrack(ev) {
    updateBtnOn(perDom, !isBtnOn(perDom));
    updateEditTagsUi();
  }

  document.getElementById('edit-tags-ok').addEventListener('click', saveAndClose, false);
  document.getElementById('edit-tags-cancel').addEventListener('click', callCloseOpenDialog, false);
  perDom.addEventListener('click', togglePerTrack, false);
  nextDom.addEventListener('click', saveAndNext, false);
  prevDom.addEventListener('click', saveAndPrev, false);

  function saveAndMoveOn(dir) {
    save();
    editTagsTrackIndex += dir;
    updateEditTagsUi();
    editTagsFocusDom.focus();
    editTagsFocusDom.select();
  }

  function saveAndNext() {
    saveAndMoveOn(1);
  }

  function saveAndPrev() {
    saveAndMoveOn(-1);
  }

  function save() {
    var trackKeysToUse = isBtnOn(perDom) ? [editTagsTrackKeys[editTagsTrackIndex]] : editTagsTrackKeys;
    var cmd = {};
    for (var i = 0; i < trackKeysToUse.length; i += 1) {
      var key = trackKeysToUse[i];
      var track = player.library.trackTable[key];
      var props = cmd[track.key] = {};
      for (var propName in EDITABLE_PROPS) {
        var propInfo = EDITABLE_PROPS[propName];
        var type = propInfo.type;
        var getter = EDIT_TAG_TYPES[type].get;
        var domItem = document.getElementById('edit-tag-' + propName);
        var multiCheckBoxDom = document.getElementById('edit-tag-multi-' + propName);
        if (multiCheckBoxDom.checked && propInfo.write) {
          props[propName] = getter(domItem);
        }
      }
    }
    player.sendCommand('updateTags', cmd);
  }

  function saveAndClose() {
    save();
    closeOpenDialog();
  }
}

function updateSliderUi() {
  var percent = parseFloat(trackSliderDom.value) * 100;
  trackSliderDom.style.backgroundSize = percent + "% 100%";
}

function onNowPlayingToggleMouseDown(ev) {
  ev.preventDefault();
  ev.stopPropagation();
  togglePlayback();
}

function onNowPlayingPrevMouseDown(ev) {
  ev.preventDefault();
  ev.stopPropagation();
  player.prev();
}

function onNowPlayingNextMouseDown(ev) {
  ev.preventDefault();
  ev.stopPropagation();
  player.next();
}

function onNowPlayingStopMouseDown(ev) {
  ev.preventDefault();
  ev.stopPropagation();
  player.stop();
}

function onTrackSliderChange(ev) {
  updateSliderUi();
  if (!player.currentItem) return;
  player.seek(null, parseFloat(trackSliderDom.value) * player.currentItem.track.duration);
}

function onTrackSliderInput(ev) {
  updateSliderUi();
  if (!player.currentItem) return;
  nowPlayingElapsedDom.textContent = formatTime(parseFloat(trackSliderDom.value) * player.currentItem.track.duration);
}

function onTrackSliderMouseDown(ev) {
  userIsSeeking = true;
}

function onTrackSliderMouseUp(ev) {
  userIsSeeking = false;
}

function setServerVol(ev) {
  var snap = 0.05;
  var val = parseFloat(volSlider.value);
  if (Math.abs(val - 1) < snap) {
    val = 1;
  }
  player.setVolume(val);
  volNumDom.textContent = Math.round(val * 100);
  volWarningDom.style.display = (val > 1) ? "" : "none";
}


function setUpNowPlayingUi() {
  nowPlayingToggleDom.addEventListener('click', onNowPlayingToggleMouseDown, false);
  nowPlayingPrevDom.addEventListener('click', onNowPlayingPrevMouseDown, false);
  nowPlayingNextDom.addEventListener('click', onNowPlayingNextMouseDown, false);
  nowPlayingStopDom.addEventListener('click', onNowPlayingStopMouseDown, false);

  trackSliderDom.addEventListener('change', onTrackSliderChange, false);
  trackSliderDom.addEventListener('input', onTrackSliderInput, false);
  trackSliderDom.addEventListener('mousedown', onTrackSliderMouseDown, false);
  trackSliderDom.addEventListener('mouseup', onTrackSliderMouseUp, false);

  volSlider.addEventListener('change', setServerVol, false);
  volSlider.addEventListener('input', setServerVol, false);
  volSlider.addEventListener('mousedown', onVolSliderMouseDown, false);
  volSlider.addEventListener('mouseup', onVolSliderMouseUp, false);

  setInterval(updateSliderPos, 100);
}

function onVolSliderMouseDown(ev) {
  userIsVolumeSliding = true;
}

function onVolSliderMouseUp(ev) {
  userIsVolumeSliding = false;
}

function clickTab(tab) {
  unselectTabs();
  tab.tab.classList.add('active');
  tab.pane.style.display = "";
  activeTab = tab;
  triggerResize();
  if (tab === tabs.events) {
    player.markAllEventsSeen();
    renderUnseenChatCount();
  }
}

function setUpTabListener(tab) {
  tab.tab.addEventListener('click', function(ev) {
    clickTab(tab);
  }, false);
}

function setUpTabsUi() {
  for (var name in tabs) {
    var tab = tabs[name];
    setUpTabListener(tab);
  }
}

function unselectTabs() {
  for (var name in tabs) {
    var tab = tabs[name];
    tab.tab.classList.remove('active');
    tab.pane.style.display = "none";
  }
}

function uploadFiles(files) {
  if (files.length === 0) return;

  var formData = new FormData();

  if (localState.autoQueueUploads) {
    formData.append('autoQueue', '1');
  }

  for (var i = 0; i < files.length; i += 1) {
    var file = files[i];
    formData.append("size", String(file.size));
    formData.append("file", file);
  }

  var progressBar = document.createElement('progress');
  var cancelBtnDom = document.createElement('button');
  cancelBtnDom.classList.add('button');
  cancelBtnDom.textContent = "Cancel";
  cancelBtnDom.addEventListener('click', onCancel, false);

  uploadWidgetDom.appendChild(progressBar);
  uploadWidgetDom.appendChild(cancelBtnDom);

  var req = new XMLHttpRequest();
  req.upload.addEventListener('progress', onProgress, false);
  req.addEventListener('load', onLoad, false);
  req.open('POST', '/upload');
  req.send(formData);
  uploadInput.value = null;

  function onProgress(ev) {
    if (!ev.lengthComputable) return;
    var progress = ev.loaded / ev.total;
    progressBar.value = progress;
  }

  function onLoad(ev) {
    cleanup();
  }

  function onCancel(ev) {
    req.abort();
    cleanup();
  }

  function cleanup() {
    progressBar.parentNode.removeChild(progressBar);
    cancelBtnDom.parentNode.removeChild(cancelBtnDom);
  }
}

function setAutoUploadBtnState() {
  if (localState.autoQueueUploads) {
    autoQueueUploadsDom.classList.add('on');
    autoQueueUploadsDom.value = "On";
  } else {
    autoQueueUploadsDom.classList.remove('on');
    autoQueueUploadsDom.value = "Off";
  }
}

function onAutoQueueUploadClick(ev) {
  localState.autoQueueUploads = !localState.autoQueueUploads;
  saveLocalState();
  setAutoUploadBtnState();
}

function onUploadByUrlKeyDown(ev) {
  ev.stopPropagation();
  if (ev.which === 27) {
    uploadByUrlDom.value = "";
    uploadByUrlDom.blur();
  } else if (ev.which === 13) {
    importUrl();
  }
}

function onImportByNameKeyDown(ev) {
  ev.stopPropagation();
  if (ev.which === 27) {
    importByNameDom.value = "";
    importByNameDom.blur();
  } else if (ev.which === 13 && !ev.shiftKey) {
    importNames();
  }
}

function onUploadInputChange(ev) {
  uploadFiles(this.files);
}

function setUpUploadUi() {
  setAutoUploadBtnState();
  autoQueueUploadsDom.addEventListener('click', onAutoQueueUploadClick, false);
  uploadInput.addEventListener('change', onUploadInputChange, false);
  uploadByUrlDom.addEventListener('keydown', onUploadByUrlKeyDown, false);
  importByNameDom.addEventListener('keydown', onImportByNameKeyDown, false);
}

function importUrl() {
  var url = uploadByUrlDom.value;
  uploadByUrlDom.value = "";
  uploadByUrlDom.blur();
  socket.send('importUrl', {
    url: url,
    autoQueue: !!localState.autoQueueUploads,
  });
}

function importNames() {
  var namesText = importByNameDom.value;
  var namesList = namesText.split("\n").map(trimIt).filter(truthy);
  importByNameDom.value = "";
  importByNameDom.blur();
  socket.send('importNames', {
    names: namesList,
    autoQueue: !!localState.autoQueueUploads,
  });
}

function updateLastFmApiKey(key) {
  lastFmApiKey = key;
  updateLastFmSettingsUi();
}

function updateLastFmSettingsUi() {
  settingsLastFmInDom.style.display = localState.lastfm.username ? "" : "none";
  settingsLastFmOutDom.style.display = localState.lastfm.username ? "none" : "";
  settingsLastFmUserDom.setAttribute('href', "http://last.fm/user/" +
      encodeURIComponent(localState.lastfm.username));
  settingsLastFmUserDom.textContent = localState.lastfm.username;
  var authUrl = "https://www.last.fm/api/auth?api_key=" +
        encodeURIComponent(lastFmApiKey) + "&cb=" +
        encodeURIComponent(location.protocol + "//" + location.host + "/");
  lastFmAuthUrlDom.setAttribute('href', authUrl);

  if (localState.lastfm.scrobbling_on) {
    toggleScrobbleDom.classList.add('on');
    toggleScrobbleDom.value = "On";
  } else {
    toggleScrobbleDom.classList.remove('on');
    toggleScrobbleDom.value = "Off";
  }
}

function updateSettingsAuthUi() {
  var i, user, newOption;
  var request = null;
  var selectedUserId = settingsUsersSelect.value;
  while (settingsUsersSelect.options.length) {
    settingsUsersSelect.remove(settingsUsersSelect.options.length - 1);
  }
  for (i = 0; i < player.usersList.length; i += 1) {
    user = player.usersList[i];
    if (user.approved) {
      newOption = document.createElement('option');
      newOption.textContent = user.name;
      newOption.value = user.id;
      settingsUsersSelect.add(newOption);
      selectedUserId = selectedUserId || user.id;
    }
    if (!user.approved && user.requested) {
      request = request || user;
    }
  }
  settingsUsersSelect.value = selectedUserId;
  updatePermsForSelectedUser();

  if (request) {
    while (requestReplaceSelect.options.length) {
      requestReplaceSelect.remove(requestReplaceSelect.options.length - 1);
    }
    for (i = 0; i < player.usersList.length; i += 1) {
      user = player.usersList[i];
      if (user.id === PlayerClient.GUEST_USER_ID) {
        user = request;
      }
      if (user.approved || user === request) {
        newOption = document.createElement('option');
        newOption.textContent = user.name;
        newOption.value = user.id;
        requestReplaceSelect.add(newOption);
      }
    }
    requestReplaceSelect.value = request.id;
    requestNameDom.value = request.name;
  }

  authPermReadDom.style.display = havePerm('read') ? "" : "none";
  authPermAddDom.style.display = havePerm('add') ? "" : "none";
  authPermControlDom.style.display = havePerm('control') ? "" : "none";
  authPermPlaylistDom.style.display = havePerm('playlist') ? "" : "none";
  authPermAdminDom.style.display = havePerm('admin') ? "" : "none";
  settingsAuthRequestDom.style.display =
    (myUser.registered && !myUser.requested && !myUser.approved) ? "" : "none";
  settingsAuthLogoutDom.style.display = myUser.registered ? "" : "none";
  settingsAuthEditDom.value = myUser.registered ? 'Edit' : 'Register';
  settingsUsersDom.style.display = havePerm('admin') ? "" : "none";
  settingsRequestsDom.style.display = (havePerm('admin') && !!request) ? "" : "none";

  toggleHardwarePlaybackDom.disabled = !havePerm('admin');
  toggleHardwarePlaybackDom.setAttribute('title', havePerm('admin') ? "" : "Requires admin privilege.");

  updateStreamUrlUi();
}

function updateStreamUrlUi() {
  streamUrlDom.setAttribute('href', streamEndpoint);
}

function updateSettingsAdminUi() {
  if (hardwarePlaybackOn) {
    toggleHardwarePlaybackDom.classList.add('on');
    toggleHardwarePlaybackDom.value = "On";
  } else {
    toggleHardwarePlaybackDom.classList.remove('on');
    toggleHardwarePlaybackDom.value = "Off";
  }
}

function sendEnsureAdminUser(ev) {
  socket.send('ensureAdminUser');
}

function onLastFmSignOutClick(ev) {
  ev.preventDefault();
  ev.stopPropagation();
  localState.lastfm.username = null;
  localState.lastfm.session_key = null;
  localState.lastfm.scrobbling_on = false;
  saveLocalState();
  updateLastFmSettingsUi();
}

function onToggleScrobbleClick(ev) {
  localState.lastfm.scrobbling_on = !localState.lastfm.scrobbling_on;
  saveLocalState();
  var msg = localState.lastfm.scrobbling_on ? 'lastFmScrobblersAdd' : 'lastFmScrobblersRemove';
  var params = {
    username: localState.lastfm.username,
    sessionKey: localState.lastfm.session_key
  };
  socket.send(msg, params);
  updateLastFmSettingsUi();
}

function onHardwarePlaybackClick(ev) {
  hardwarePlaybackOn = !hardwarePlaybackOn;
  socket.send('hardwarePlayback', hardwarePlaybackOn);
  updateSettingsAdminUi();
}

function onSettingsAuthEditClick(ev) {
  authUsernameDom.value = localState.authUsername;
  authPasswordDom.value = localState.authPassword;
  hideShowAuthEdit(true);
  authUsernameDom.focus();
  authUsernameDom.select();
}

function onAuthShowPasswordChange(ev) {
  var revealPassword = !isBtnOn(authShowPasswordDom);
  updateBtnOn(authShowPasswordDom, revealPassword);
  authPasswordDom.type = revealPassword ? 'text' : 'password';
}

function onSettingsAuthRequestClick(ev) {
  socket.send('requestApproval');
  myUser.requested = true;
  updateSettingsAuthUi();
}

function onSettingsAuthLogoutClick(ev) {
  localState.authUsername = null;
  localState.authPassword = null;
  saveLocalState();
  socket.send('logout');
  myUser.registered = false;
  updateSettingsAuthUi();
}

function onSettingsDelUserClick(ev) {
  var selectedUserId = settingsUsersSelect.value;
  socket.send('deleteUsers', [selectedUserId]);
}

function onRequestApproveClick(ev) {
  handleApproveDeny(true);
}

function onRequestDenyClick(ev) {
  handleApproveDeny(false);
}

function setUpSettingsUi() {
  ensureAdminBtn.addEventListener('click', sendEnsureAdminUser, false);
  lastFmSignOutDom.addEventListener('click', onLastFmSignOutClick, false);
  toggleScrobbleDom.addEventListener('click', onToggleScrobbleClick, false);
  toggleHardwarePlaybackDom.addEventListener('click', onHardwarePlaybackClick, false);
  settingsAuthEditDom.addEventListener('click', onSettingsAuthEditClick, false);
  settingsAuthSaveDom.addEventListener('click', settingsAuthSave, false);
  settingsAuthCancelDom.addEventListener('click', settingsAuthCancel, false);
  authUsernameDom.addEventListener('keydown', handleUserOrPassKeyDown, false);
  authPasswordDom.addEventListener('keydown', handleUserOrPassKeyDown, false);
  authShowPasswordDom.addEventListener('click', onAuthShowPasswordChange, false);
  settingsAuthRequestDom.addEventListener('click', onSettingsAuthRequestClick, false);
  settingsAuthLogoutDom.addEventListener('click', onSettingsAuthLogoutClick, false);

  userPermReadDom.addEventListener('click', updateSelectedUserPerms, false);
  userPermAddDom.addEventListener('click', updateSelectedUserPerms, false);
  userPermControlDom.addEventListener('click', updateSelectedUserPerms, false);
  userPermPlaylistDom.addEventListener('click', updateSelectedUserPerms, false);
  userPermAdminDom.addEventListener('click', updateSelectedUserPerms, false);

  settingsUsersSelect.addEventListener('change', updatePermsForSelectedUser, false);
  settingsDelUserDom.addEventListener('click', onSettingsDelUserClick, false);

  requestApproveDom.addEventListener('click', onRequestApproveClick, false);
  requestDenyDom.addEventListener('click', onRequestDenyClick, false);

  document.getElementById('keyboard-shortcuts-link').addEventListener('click', showKeyboardShortcuts, false);
}

function showKeyboardShortcuts(ev) {
  ev.preventDefault();
  ev.stopPropagation();
  popDialog(shortcutsDom, "Keyboard Shortcuts", 600, window.innerHeight - 40);
}

function handleApproveDeny(approved) {
  var request = null;
  for (var i = 0; i < player.usersList.length; i += 1) {
    var user = player.usersList[i];
    if (!user.approved && user.requested) {
      request = user;
      break;
    }
  }
  if (!request) return;
  socket.send('approve', [{
    id: request.id,
    replaceId: requestReplaceSelect.value,
    approved: approved,
    name: requestNameDom.value,
  }]);
}

function isBtnOn(btn) {
  return btn.classList.contains('on');
}

function updateBtnOn(btn, on) {
  if (on) {
    btn.classList.add('on');
  } else {
    btn.classList.remove('on');
  }
}

function updatePermsForSelectedUser() {
  var selectedUserId = settingsUsersSelect.value;
  var user = player.usersTable[selectedUserId];
  if (!user) return;

  updateBtnOn(userPermReadDom, user.perms.read);
  updateBtnOn(userPermAddDom, user.perms.add);
  updateBtnOn(userPermControlDom, user.perms.control);
  updateBtnOn(userPermPlaylistDom, user.perms.playlist);
  updateBtnOn(userPermAdminDom, user.perms.admin);

  settingsDelUserDom.disabled = (selectedUserId === PlayerClient.GUEST_USER_ID);
}

function updateSelectedUserPerms(ev) {
  updateBtnOn(ev.target, !isBtnOn(ev.target));
  socket.send('updateUser', {
    userId: settingsUsersSelect.value,
    perms: {
      read: isBtnOn(userPermReadDom),
      add: isBtnOn(userPermAddDom),
      control: isBtnOn(userPermControlDom),
      playlist: isBtnOn(userPermPlaylistDom),
      admin: isBtnOn(userPermAdminDom),
    },
  });
}

function handleUserOrPassKeyDown(ev) {
  ev.stopPropagation();
  if (ev.which === 27) {
    settingsAuthCancel(ev);
  } else if (ev.which === 13) {
    settingsAuthSave(ev);
  }
}

function onEventsListScroll(ev) {
  eventsListScrolledToBottom =
    (eventsListDom.scrollHeight - eventsListDom.scrollTop) === eventsListDom.offsetHeight;
}

function onChatBoxInputKeyDown(ev) {
  ev.stopPropagation();
  if (ev.which === 27) {
    chatBoxInputDom.blur();
    ev.preventDefault();
    return;
  } else if (ev.which === 13) {
    var msg = chatBoxInputDom.value.trim();
    if (!msg.length) {
      ev.preventDefault();
      return;
    }
    var match = msg.match(/^\/([^\/]\w*)\s*(.*)$/);
    if (match) {
      var chatCommand = chatCommands[match[1]];
      if (chatCommand) {
        if (!chatCommand(match[2])) {
          // command failed; no message sent
          ev.preventDefault();
          return;
        }
      } else {
        // don't clear the text box; invalid command
        ev.preventDefault();
        return;
      }
    } else {
      // replace starting '//' with '/'
      socket.send('chat', { text: msg.replace(/^\/\//, '/') });
    }
    setTimeout(clearChatInputValue, 0);
    ev.preventDefault();
    return;
  }
}

function setUpEventsUi() {
  eventsListDom.addEventListener('scroll', onEventsListScroll, false);
  chatBoxInputDom.addEventListener('keydown', onChatBoxInputKeyDown, false);
}

function displaySlashMe(message) {
  if (!message) return false;
  socket.send('chat', {
    text: message,
    displayClass: 'me',
  });
  return true;
}

function clearChatInputValue() {
  chatBoxInputDom.value = "";
}

function renderUnseenChatCount() {
  var eventsTabText = (player.unseenChatCount > 0) ?
    ("Chat (" + player.unseenChatCount + ")") : "Chat";
  tabs.events.tab.textContent = eventsTabText;
  updateTitle();
}

function updateTitle() {
  var track = player.currentItem && player.currentItem.track;
  var prefix = (player.unseenChatCount > 0) ? ("(" + player.unseenChatCount + ") ") : "";
  if (track) {
    document.title = prefix + getNowPlayingText(track) + " - " + BASE_TITLE;
  } else {
    document.title = prefix + BASE_TITLE;
  }
}

function renderImportProgress() {
  var scrollTop = importProgressListDom.scrollTop;

  var importTabText = (player.importProgressList.length > 0) ?
    ("Import (" + player.importProgressList.length + ")") : "Import";
  tabs.upload.tab.textContent = importTabText;

  // add the missing dom entries
  var i, ev;
  for (i = importProgressListDom.childElementCount; i < player.importProgressList.length; i += 1) {
    importProgressListDom.insertAdjacentHTML('beforeend',
      '<li class="progress">' +
        '<span class="name"></span> ' +
        '<span class="percent"></span>' +
      '</li>');
  }
  // remove extra dom entries
  while (player.importProgressList.length < importProgressListDom.childElementCount) {
    importProgressListDom.removeChild(importProgressListDom.lastChild);
  }
  // overwrite existing dom entries
  var domItems = importProgressListDom.children;
  for (i = 0; i < player.importProgressList.length; i += 1) {
    var domItem = domItems[i];
    ev = player.importProgressList[i];
    domItem.children[0].textContent = ev.filenameHintWithoutPath;
    var percent = humanSize(ev.bytesWritten, 1);
    if (ev.size) {
      percent += " / " + humanSize(ev.size, 1);
    }
    domItem.children[1].textContent = percent;
  }

  importProgressDom.style.display = (player.importProgressList.length > 0) ? "" : "none";
  importProgressListDom.scrollTop = scrollTop;
}

function renderEvents() {
  var scrollTop = eventsListDom.scrollTop;

  renderUnseenChatCount();

  // add the missing dom entries
  var i, ev;
  for (i = eventsListDom.childElementCount; i < player.eventsList.length; i += 1) {
    eventsListDom.insertAdjacentHTML('beforeend',
      '<div class="event">' +
        '<span class="name"></span>' +
        '<span class="msg"></span>' +
        '<div style="clear: both;"></div>' +
      '</div>');
  }
  // remove extra dom entries
  while (player.eventsList.length < eventsListDom.childElementCount) {
    eventsListDom.removeChild(eventsListDom.lastChild);
  }
  // overwrite existing dom entries
  var domItems = eventsListDom.children;
  for (i = 0; i < player.eventsList.length; i += 1) {
    var domItem = domItems[i];
    ev = player.eventsList[i];
    var userText = ev.user ? ev.user.name : "*";

    domItem.className = "";
    domItem.classList.add('event');
    domItem.classList.add(ev.type);
    if (ev.displayClass) domItem.classList.add('chat-me');
    domItem.children[0].textContent = userText;
    domItem.children[0].setAttribute('title', ev.date.toString());
    domItem.children[1].innerHTML = getEventMessageHtml(ev);
  }

  if (eventsListScrolledToBottom) {
    scrollEventsToBottom();
  } else {
    eventsListDom.scrollTop = scrollTop;
  }
}

function getEventMessageHtml(ev) {
  var fn = eventTypeMessageFns[ev.type];
  if (!fn) throw new Error("Unknown event type: " + ev.type);
  var flags = {safe: false};
  var text = fn(ev, flags);
  return flags.safe ? text : escapeHtml(text);
}

function linkify(text) {
  return text.replace(/(\b(https?|ftp|file):\/\/[\-A-Z0-9+&@#\/\[\]%?=~_|!:,.;]*[\-A-Z0-9+&@#\/\[\]%=~_|])/ig, '<a href="$1" target="_blank">$1</a>');
}


function escapeHtml(str) {
  return str.replace(/[&"<>]/g, function (m) {
    return escapeHtmlReplacements[m];
  });
}

function scrollEventsToBottom() {
  eventsListScrolledToBottom = true;
  eventsListDom.scrollTop = 1000000;
}

function eventPlaylistName(ev) {
  return ev.playlist ? ("playlist " + ev.playlist.name) : "(deleted playlist)";
}

function eventLabelName(ev, name) {
  if (name) {
    return "label " + name;
  } else {
    return ev.label ? ("label " + ev.label.name) : "(deleted label)";
  }
}

function getEventNowPlayingText(ev) {
  if (ev.track) {
    return getNowPlayingText(ev.track);
  } else if (ev.text) {
    return "(Deleted Track) " + ev.text;
  } else {
    return "(No Track)";
  }
}
function renderOnlineUsers() {
  var i;
  var user;
  var sortedConnectedUsers = [];
  for (i = 0; i < player.usersList.length; i += 1) {
    user = player.usersList[i];
    if (user.connected) {
      sortedConnectedUsers.push(user);
    }
  }

  var scrollTop = eventsOnlineUsersDom.scrollTop;


  // add the missing dom entries
  var heightChanged = eventsOnlineUsersDom.childElementCount !== sortedConnectedUsers.length;
  for (i = eventsOnlineUsersDom.childElementCount; i < sortedConnectedUsers.length; i += 1) {
    eventsOnlineUsersDom.insertAdjacentHTML('beforeend',
      '<div class="user">' +
        '<span class="streaming icon icon-signal-diag"></span>' +
        '<span class="name"></span>' +
      '</div>');
  }
  // remove extra dom entries
  while (sortedConnectedUsers.length < eventsOnlineUsersDom.childElementCount) {
    eventsOnlineUsersDom.removeChild(eventsOnlineUsersDom.lastChild);
  }
  // overwrite existing dom entries
  var domItems = eventsOnlineUsersDom.children;
  for (i = 0; i < sortedConnectedUsers.length; i += 1) {
    var domItem = domItems[i];
    user = sortedConnectedUsers[i];
    domItem.children[0].style.display = user.streaming ? "" : "none";
    domItem.children[1].textContent = user.name;
  }

  eventsOnlineUsersDom.scrollTop = scrollTop;

  if (heightChanged) {
    triggerResize();
  }
}

function ensureSearchHappensSoon() {
  if (searchTimer != null) {
    clearTimeout(searchTimer);
  }
  // give the user a small timeout between key presses to finish typing.
  // otherwise, we might be bogged down displaying the search results for "a" or the like.
  searchTimer = setTimeout(function() {
    player.search(libFilterDom.value);
    searchTimer = null;
  }, 100);
}

function onLibFilterKeyDown(ev) {
  ev.stopPropagation();
  switch (ev.which) {
  case 27: // Escape
    ev.preventDefault();
    if (libFilterDom.value.length === 0) {
      libFilterDom.blur();
    } else {
      // queue up a search refresh now, because if the user holds Escape,
      // it will blur the search box, and we won't get a keyup for Escape.
      setTimeout(clearBoxAndSearch, 0);
    }
    return;
  case 13: // Enter
    ev.preventDefault();
    var keys = [];
    for (var i = 0; i < player.searchResults.artistList.length; i += 1) {
      var artist = player.searchResults.artistList[i];
      for (var j = 0; j < artist.albumList.length; j += 1) {
        var album = artist.albumList[j];
        for (var k = 0; k < album.trackList.length; k += 1) {
          var track = album.trackList[k];
          keys.push(track.key);
        }
      }
    }
    if (ev.altKey) shuffle(keys);
    if (keys.length > 2000) {
      if (!confirm("You are about to queue " + keys.length + " songs.")) {
        return;
      }
    }
    if (ev.shiftKey) {
      player.queueTracksNext(keys);
    } else {
      player.queueOnQueue(keys);
    }
    return;
  case 40:
    ev.preventDefault();
    selection.selectOnlyFirstPos('library');
    selection.scrollToCursor();
    refreshSelection();
    libFilterDom.blur();
    return;
  case 38:
    ev.preventDefault();
    selection.selectOnlyLastPos('library');
    selection.scrollToCursor();
    refreshSelection();
    libFilterDom.blur();
    return;
  }

  function clearBoxAndSearch() {
    libFilterDom.value = "";
    ensureSearchHappensSoon();
  }
}

function setUpLibraryUi() {
  libFilterDom.addEventListener('keydown', onLibFilterKeyDown, false);
  libFilterDom.addEventListener('keyup', ensureSearchHappensSoon, false);
  libFilterDom.addEventListener('cut', ensureSearchHappensSoon, false);
  libFilterDom.addEventListener('paste', ensureSearchHappensSoon, false);
  genericTreeUi(libraryArtistsDom, {
    toggleExpansion: toggleLibraryExpansion,
    isSelectionOwner: function(){
      return selection.isLibrary();
    }
  });
  contextMenuDom.addEventListener('mousedown', preventEventDefault, false);

  menuQueue.addEventListener('click', function(ev) {
    ev.stopPropagation();
    ev.preventDefault();
    player.queueOnQueue(selection.toTrackKeys());
    removeContextMenu();
  }, false);
  menuQueueNext.addEventListener('click', function(ev) {
    ev.stopPropagation();
    ev.preventDefault();
    player.queueTracksNext(selection.toTrackKeys());
    removeContextMenu();
  }, false);
  menuQueueRandom.addEventListener('click', function(ev) {
    ev.stopPropagation();
    ev.preventDefault();
    player.queueOnQueue(selection.toTrackKeys(true));
    removeContextMenu();
  }, false);
  menuQueueNextRandom.addEventListener('click', function(ev) {
    ev.stopPropagation();
    ev.preventDefault();
    player.queueTracksNext(selection.toTrackKeys(true));
    removeContextMenu();
  }, false);
  menuDownload.addEventListener('click', onDownloadContextMenu, false);
  menuDelete.addEventListener('click', onDeleteContextMenu, false);
  menuEditTags.addEventListener('click', onEditTagsContextMenu, false);
  menuDeletePlaylist.addEventListener('click', onDeletePlaylistContextMenu, false);
  menuRenamePlaylist.addEventListener('click', onRenamePlaylistContextMenu, false);
  menuRemove.addEventListener('click', onRemoveFromPlaylistContextMenu, false);
  menuShuffle.addEventListener('click', onShuffleContextMenu, false);
  menuAddToPlaylist.addEventListener('click', onAddToPlaylistContextMenu, false);
  menuAddRemoveLabel.addEventListener('click', onAddRemoveLabelContextMenu, false);
}

function onAddToPlaylistContextMenu(ev) {
  ev.preventDefault();
  ev.stopPropagation();
  if (!havePerm('playlist')) return;
  if (selection.isEmpty()) return;
  removeContextMenu();
  popAddToPlaylistDialog();
}

function onAddRemoveLabelContextMenu(ev) {
  ev.preventDefault();
  ev.stopPropagation();
  if (!havePerm('playlist')) return;
  if (selection.isEmpty()) return;
  removeContextMenu();
  updateLabelsUi();
  popAddRemoveLabelDialog();
}

function maybeRenamePlaylistAtCursor() {
  if (selection.cursorType !== 'playlist') return;
  var playlist = player.playlistTable[selection.cursor];
  var newName = prompt("Rename playlist \"" + playlist.name + "\" to:", playlist.name);
  if (newName) {
    player.renamePlaylist(playlist, newName);
  }
}

function maybeDeleteSelectedPlaylists() {
  var ids = Object.keys(selection.ids.playlist);
  var nameList = [];
  for (var id in selection.ids.playlist) {
    nameList.push(player.playlistTable[id].name);
  }
  var listText = nameList.slice(0, 7).join("\n  ");
  if (nameList.length > 7) {
    listText += "\n  ...";
  }
  var playlistText = nameList.length === 1 ? "playlist" : "playlists";
  var message = "You are about to delete " + nameList.length + " " + playlistText +
    " permanently:\n\n  " + listText;
  if (!confirm(message)) return false;
  player.deletePlaylists(selection.ids.playlist);
  return true;
}

function onRenamePlaylistContextMenu(ev) {
  ev.stopPropagation();
  ev.preventDefault();
  maybeRenamePlaylistAtCursor();
  removeContextMenu();
}

function onDeletePlaylistContextMenu(ev) {
  ev.stopPropagation();
  ev.preventDefault();
  maybeDeleteSelectedPlaylists();
  removeContextMenu();
}

function onRemoveFromPlaylistContextMenu(ev) {
  ev.stopPropagation();
  ev.preventDefault();
  handleDeletePressed(false);
  removeContextMenu();
}

function blockContextMenu(ev) {
  if (ev.altKey) return;
  ev.preventDefault();
  ev.stopPropagation();
}

function genericTreeUi(elem, options) {
  elem.addEventListener('mousedown', onElemMouseDown, false);
  elem.addEventListener('contextmenu', blockContextMenu, false);
  elem.addEventListener('dblclick', onDblClick, false);

  function onElemMouseDown(ev) {
    ev.stopPropagation();
    ev.preventDefault();

    var expandableElem = firstElemWithClass(elem, 'expandable', ev.target);
    if (expandableElem && ev.target === expandableElem.children[0]) {
      options.toggleExpansion(expandableElem.parentNode);
      return;
    }

    var clickableElem = firstElemWithClass(elem, 'clickable', ev.target);
    if (!clickableElem) {
      return;
    }

    document.activeElement.blur();
    var type = clickableElem.getAttribute('data-type');
    var key = clickableElem.getAttribute('data-key');
    if (ev.which === 1) {
      leftMouseDown(ev);
    } else if (ev.which === 3) {
      if (ev.altKey) {
        return;
      }
      rightMouseDown(ev);
    }
    function leftMouseDown(ev){
      removeContextMenu();
      var skipDrag = false;
      if (!options.isSelectionOwner()) {
        selection.selectOnly(type, key);
      } else if (ev.ctrlKey || ev.shiftKey) {
        skipDrag = true;
        selection.cursor = key;
        selection.cursorType = type;
        if (!ev.shiftKey && !ev.ctrlKey) {
          selection.selectOnly(type, key);
        } else if (ev.shiftKey) {
          selectTreeRange();
        } else if (ev.ctrlKey) {
          toggleSelectionUnderCursor();
        }
      } else if (selection.ids[type][key] == null) {
        selection.selectOnly(type, key);
      }
      refreshSelection();
      if (!skipDrag) {
        performDrag(ev, {
          complete: function(result, ev){
            var delta = {
              top: 0,
              bottom: 1
            };
            var keys = selection.toTrackKeys(ev.altKey);
            player.queueOnQueue(keys, result.previousKey, result.nextKey);
          },
          cancel: function(){
            selection.selectOnly(type, key);
            refreshSelection();
          }
        });
      }
    }
    function rightMouseDown(ev){
      ev.preventDefault();
      if (!options.isSelectionOwner() || selection.ids[type][key] == null) {
        selection.selectOnly(type, key);
        refreshSelection();
      }
      popContextMenu(type, ev.pageX, ev.pageY);
    }

  }

  function onDblClick(ev) {
    ev.stopPropagation();
    ev.preventDefault();

    var expandableElem = firstElemWithClass(elem, 'expandable', ev.target);
    if (expandableElem && ev.target === expandableElem.children[0]) {
      return;
    }
    var clickableElem = firstElemWithClass(elem, 'clickable', ev.target);
    if (clickableElem) {
      queueSelection(ev);
    }
  }
}

function encodeDownloadHref(file) {
  // be sure to escape #hashtags
  return 'library/' + encodeURI(file).replace(/#/g, "%23");
}

function makeDownloadHref() {
  var keys = selection.toTrackKeys();
  if (keys.length === 1) {
    return encodeDownloadHref(player.library.trackTable[keys[0]].file);
  } else {
    return "/download/keys?" + keys.join("&");
  }
}

function updateMenuDisableState(menu) {
  for (var permName in menuPermSelectors) {
    var menuItemList = menuPermSelectors[permName];
    enableDisable(menuItemList, havePerm(permName));
  }

  function enableDisable(menuItemList, enable) {
    menuItemList.forEach(function(menuItem) {
      menuItem.setAttribute('title', enable ? '' : "Insufficient privileges. See Settings.");
      if (enable) {
        menuItem.classList.remove('disabled');
      } else {
        menuItem.classList.add('disabled');
      }
    });
  }
}

function setUpUi() {
  setUpGenericUi();
  setUpPlayQueueUi();
  setUpPlaylistsUi();
  setUpLibraryUi();
  setUpNowPlayingUi();
  setUpTabsUi();
  setUpUploadUi();
  setUpSettingsUi();
  setUpEditTagsUi();
  setUpEventsUi();
  setUpStreamUi();
}

function setUpStreamUi() {
  streamBtnDom.addEventListener('click', toggleStreamStatusEvent, false);
  clientVolSlider.addEventListener('change', setClientVol, false);
  clientVolSlider.addEventListener('input', setClientVol, false);

  clientVolSlider.value = localState.clientVolume || 1;
  setClientVol();
}

function toQueueItemId(s) {
  return "playlist-track-" + s;
}

function toArtistId(s) {
  return "lib-artist-" + toHtmlId(s);
}

function toAlbumId(s) {
  return "lib-album-" + toHtmlId(s);
}

function toTrackId(s) {
  return "lib-track-" + s;
}

function toPlaylistItemId(s) {
  return "pl-item-" + s;
}

function toPlaylistId(s) {
  return "pl-pl-" + s;
}

function resizeDomElements() {
  var eventsScrollTop = eventsListDom.scrollTop;

  nowPlayingDom.style.width = (window.innerWidth - MARGIN * 2) + "px";
  var secondLayerTop = nowPlayingDom.getBoundingClientRect().top + nowPlayingDom.clientHeight + MARGIN;
  leftWindowDom.style.left = MARGIN + "px";
  leftWindowDom.style.top = secondLayerTop + "px";
  var queueWindowLeft = MARGIN + leftWindowDom.clientWidth + MARGIN;
  queueWindowDom.style.left = queueWindowLeft + "px";
  queueWindowDom.style.top = secondLayerTop + "px";
  queueWindowDom.style.width = (window.innerWidth - queueWindowLeft - MARGIN) + "px";
  leftWindowDom.style.height = (window.innerHeight - secondLayerTop) + "px";
  queueWindowDom.style.height = (leftWindowDom.clientHeight - MARGIN) + "px";
  var tabContentsHeight = leftWindowDom.clientHeight - tabsDom.clientHeight - MARGIN;
  libraryDom.style.height = (tabContentsHeight - libHeaderDom.clientHeight) + "px";
  uploadDom.style.height = tabContentsHeight + "px";
  eventsListDom.style.height = (tabContentsHeight - eventsOnlineUsersDom.clientHeight - chatBoxDom.clientHeight) + "px";
  playlistsDom.style.height = (tabContentsHeight - newPlaylistNameDom.offsetHeight) + "px";

  setAllTabsHeight(tabContentsHeight);
  queueItemsDom.style.height = (queueWindowDom.clientHeight - queueHeaderDom.offsetTop - queueHeaderDom.clientHeight) + "px";

  if (eventsListScrolledToBottom) {
    scrollEventsToBottom();
  }
}

function refreshPage() {
  location.href = location.protocol + "//" + location.host + "/";
}

function setAllTabsHeight(h) {
  for (var name in tabs) {
    var tab = tabs[name];
    tab.pane.style.height = h + "px";
  }
}

function getStreamerCount() {
  var count = player.anonStreamers;
  player.usersList.forEach(function(user) {
    if (user.streaming) count += 1;
  });
  return count;
}

function getStreamStatusLabel() {
  if (tryingToStream) {
    if (actuallyStreaming) {
      if (stillBuffering) {
        return "Buffering";
      } else {
        return "On";
      }
    } else {
      return "Paused";
    }
  } else {
    return "Off";
  }
}

function getStreamButtonLabel() {
  return getStreamerCount() + " Stream: " + getStreamStatusLabel();
}

function renderStreamButton() {
  streamBtnLabel.textContent = getStreamButtonLabel();
  updateBtnOn(streamBtnDom, tryingToStream);
  clientVolDom.style.display = tryingToStream ? "" : "none";
}

function toggleStreamStatus() {
  tryingToStream = !tryingToStream;
  sendStreamingStatus();
  renderStreamButton();
  updateStreamPlayer();
}

function toggleStreamStatusEvent(ev) {
  ev.stopPropagation();
  ev.preventDefault();
  toggleStreamStatus();
}

function sendStreamingStatus() {
  socket.send("setStreaming", tryingToStream);
}

function onStreamPlaying() {
  stillBuffering = false;
  renderStreamButton();
}

function clearStreamBuffer() {
  if (tryingToStream) {
    tryingToStream = !tryingToStream;
    updateStreamPlayer();
    tryingToStream = !tryingToStream;
    updateStreamPlayer();
  }
}

function updateStreamPlayer() {
  if (actuallyStreaming !== tryingToStream || actuallyPlaying !== player.isPlaying) {
    if (tryingToStream) {
      streamAudio.src = streamEndpoint;
      streamAudio.load();
      if (player.isPlaying) {
        streamAudio.play();
        stillBuffering = true;
        actuallyPlaying = true;
      } else {
        streamAudio.pause();
        stillBuffering = false;
        actuallyPlaying = false;
      }
    } else {
      streamAudio.pause();
      streamAudio.src = "";
      streamAudio.load();
      stillBuffering = false;
      actuallyPlaying = false;
    }
    actuallyStreaming = tryingToStream;
  }
  renderStreamButton();
}

function setClientVol() {
  setStreamVolume(clientVolSlider.value);
}

function setStreamVolume(v) {
  if (v < 0) v = 0;
  if (v > 1) v = 1;
  streamAudio.volume = v;
  localState.clientVolume = v;
  saveLocalState();
  clientVolSlider.value = streamAudio.volume;
}

function init() {
  loadLocalState();
  socket = new Socket();
  var queryObj = parseQueryString();
  if (queryObj.token) {
    socket.on('connect', function() {
      socket.send('lastFmGetSession', queryObj.token);
    });
    socket.on('lastFmGetSessionSuccess', function(params){
      localState.lastfm.username = params.session.name;
      localState.lastfm.session_key = params.session.key;
      localState.lastfm.scrobbling_on = false;
      saveLocalState();
      refreshPage();
    });
    socket.on('lastFmGetSessionError', function(message){
      alert("Error authenticating: " + message);
      refreshPage();
    });
    return;
  }
  socket.on('hardwarePlayback', function(isOn) {
    hardwarePlaybackOn = isOn;
    updateSettingsAdminUi();
  });
  socket.on('lastFmApiKey', updateLastFmApiKey);
  socket.on('user', function(data) {
    myUser = data;
    authUsernameDisplayDom.textContent = myUser.name;
    if (!localState.authUsername || !localState.authPassword) {
      // We didn't have a user account saved. The server assigned us a name.
      // Generate a password and call dibs on the account.
      localState.authUsername = myUser.name;
      localState.authPassword = uuid();
      saveLocalState();
      sendAuth();
    }
    updateSettingsAuthUi();
  });
  socket.on('token', function(token) {
    document.cookie = "token=" + token + "; path=/";
  });
  socket.on('streamEndpoint', function(data) {
    streamEndpoint = data;
    updateStreamPlayer();
    updateStreamUrlUi();
  });
  socket.on('autoDjOn', function(data) {
    autoDjOn = data;
    renderQueueButtons();
    triggerRenderQueue();
  });
  socket.on('haveAdminUser', function(data) {
    haveAdminUser = data;
    updateHaveAdminUserUi();
  });
  socket.on('connect', function(){
    sendAuth();
    sendStreamingStatus();
    socket.send('subscribe', {name: 'streamEndpoint'});
    socket.send('subscribe', {name: 'autoDjOn'});
    socket.send('subscribe', {name: 'hardwarePlayback'});
    socket.send('subscribe', {name: 'haveAdminUser'});
    loadStatus = LoadStatus.GoodToGo;
    render();
    ensureSearchHappensSoon();
  });
  player = new PlayerClient(socket);
  player.on('users', function() {
    updateSettingsAuthUi();
    renderEvents();
    renderOnlineUsers();
    renderStreamButton();
  });
  player.on('importProgress', renderImportProgress);
  player.on('libraryUpdate', function() {
    triggerRenderLibrary();
    triggerLabelsUpdate();
    triggerRenderQueue();
    renderNowPlaying();
    renderQueueButtons();
  });
  player.on('queueUpdate', triggerRenderQueue);
  player.on('scanningUpdate', triggerRenderQueue);
  player.on('playlistsUpdate', triggerPlaylistsUpdate);
  player.on('labelsUpdate', function() {
    triggerLabelsUpdate();
    triggerRenderQueue();
  });
  player.on('volumeUpdate', renderVolumeSlider);
  player.on('statusUpdate', function(){
    renderNowPlaying();
    renderQueueButtons();
    labelQueueItems();
  });
  player.on('events', function() {
    if (activeTab === tabs.events && isBrowserTabActive) {
      player.markAllEventsSeen();
    }
    renderEvents();
  });
  player.on('currentTrack', updateStreamPlayer);
  player.on('anonStreamers', renderStreamButton);
  socket.on('seek', clearStreamBuffer);
  socket.on('disconnect', function(){
    loadStatus = LoadStatus.NoServer;
    render();
  });
  socket.on('error', function(err) {
    console.error(err);
  });

  setUpUi();
  render();
  window._debug_player = player;
  window._debug_selection = selection;
}

function onWindowFocus() {
  isBrowserTabActive = true;
  if (activeTab === tabs.events) {
    player.markAllEventsSeen();
    renderUnseenChatCount();
  }
}

function onWindowBlur() {
  isBrowserTabActive = false;
}

function compareArrays(arr1, arr2) {
  for (var i1 = 0; i1 < arr1.length; i1 += 1) {
    var val1 = arr1[i1];
    var val2 = arr2[i1];
    var diff = (val1 != null ? val1 : -1) - (val2 != null ? val2 : -1);
    if (diff !== 0) return diff;
  }
  return 0;
}

function formatTime(seconds) {
  if (seconds == null) return "";
  var sign = "";
  if (seconds < 0) {
    sign = "-";
    seconds = -seconds;
  }
  seconds = Math.floor(seconds);
  var minutes = Math.floor(seconds / 60);
  seconds -= minutes * 60;
  var hours = Math.floor(minutes / 60);
  minutes -= hours * 60;
  if (hours !== 0) {
    return sign + hours + ":" + zfill(minutes, 2) + ":" + zfill(seconds, 2);
  } else {
    return sign + minutes + ":" + zfill(seconds, 2);
  }
}

function toHtmlId(string) {
  return string.replace(/[^a-zA-Z0-9-]/gm, function(c) {
    return "_" + c.charCodeAt(0) + "_";
  });
}

function zfill(number, size) {
  number = String(number);
  while (number.length < size) number = "0" + number;
  return number;
}

function havePerm(permName) {
  return !!(myUser && myUser.perms[permName]);
}

function parseQueryString(s) {
  s = s || location.search.substring(1);
  var o = {};
  var pairs = s.split('&');
  pairs.forEach(function(pair) {
    var keyValueArr = pair.split('=');
    o[keyValueArr[0]] = keyValueArr[1];
  });
  return o;
}

function trimIt(s) {
  return s.trim();
}

function truthy(x) {
  return !!x;
}

function alwaysTrue() {
  return true;
}

function preventEventDefault(ev) {
  ev.preventDefault();
  ev.stopPropagation();
}

function extend(dest, src) {
  for (var name in src) {
    dest[name] = src[name];
  }
  return dest;
}

function noop() {}

function popDialog(dom, title, width, height) {
  blackoutDom.style.display = "";

  dom.parentNode.removeChild(dom);
  modalContentDom.appendChild(dom);

  modalTitleDom.textContent = title;

  modalDom.style.left = (window.innerWidth / 2 - width / 2) + "px";
  modalDom.style.top = (window.innerHeight / 2 - height / 2) + "px";
  modalDom.style.width = width + "px";
  modalDom.style.height = height + "px";
  modalDom.style.display = "";

  modalContentDom.style.height = (height - modalHeaderDom.clientHeight - 20) + "px";

  dom.style.display = "";
  dom.focus();

  closeOpenDialog = function() {
    blackoutDom.style.display = "none";
    modalDom.style.display = "none";
    modalDom.style.display = "none";
    dom.style.display = "none";
    dom.parentNode.removeChild(dom);
    document.body.appendChild(dom);

    closeOpenDialog = noop;
  };
}
    },
    "curlydiff": function(require) {
// https://github.com/thejoshwolfe/curlydiff

function diff(from, to) {
  if (!isObject(from) || !isObject(to)) {
    // not both objects
    if (from === to) return undefined;
    if (from instanceof Date && to instanceof Date && from.getTime() === to.getTime()) return undefined;
    // there's a difference
    return to;
  }
  // both are objects
  var result = {};
  var anythingChanged = false;
  for (var key in from) {
    var childDiff;
    if (key in to) {
      childDiff = diff(from[key], to[key]);
      if (childDiff === undefined) continue;
    } else {
      // deleted
      childDiff = null;
    }
    // there's a difference
    result[key] = childDiff;
    anythingChanged = true;
  }
  for (var key in to) {
    if (key in from) continue; // handled above
    result[key] = to[key];
    anythingChanged = true;
  }
  if (anythingChanged) return result;
  // no change
  return undefined;
}

function apply(object, patch) {
  if (patch === undefined) return object;
  if (!isObject(object) || !isObject(patch)) return patch;
  // both are objects
  for (var key in patch) {
    var patchChild = patch[key];
    if (patchChild == null) {
      // removed
      delete object[key];
    } else {
      // either this assignment or this function call will have side effects
      object[key] = apply(object[key], patchChild);
    }
  }
  return object;
}

function isObject(object) {
  if (object == null) return false;
  if (typeof object !== "object") return false;
  if (Array.isArray(object)) return false;
  if (object instanceof Date) return false;
  return true;
}

return {
  diff: diff,
  apply: apply,
  isObject: isObject,
};    },
    "event_emitter": function(require) {
var slice = Array.prototype.slice;

function EventEmitter() {
  this.listeners = {};
}

EventEmitter.prototype.on = function(name, listener) {
  var listeners = this.listeners[name] = (this.listeners[name] || []) ;
  listeners.push(listener);
};

EventEmitter.prototype.emit = function(name) {
  var args = slice.call(arguments, 1);
  var listeners = this.listeners[name];
  if (!listeners) return;
  for (var i = 0; i < listeners.length; i += 1) {
    var listener = listeners[i];
    listener.apply(null, args);
  }
};

EventEmitter.prototype.removeListener = function(name, listener) {
  var listeners = this.listeners[name];
  if (!listeners) return;
  var badIndex = listeners.indexOf(listener);
  if (badIndex === -1) return;
  listeners.splice(badIndex, 1);
};

return EventEmitter;
    },
    "human-size": function(require) {
// https://github.com/andrewrk/node-human-size

var mags = ' KMGTPEZY';

function humanSize(bytes, precision) {
  var magnitude = Math.min(Math.log(bytes) / Math.log(1024) | 0, mags.length - 1);
  var result = bytes / Math.pow(1024, magnitude);
  var suffix = mags[magnitude].trim() + 'B';
  return result.toFixed(precision) + suffix;
}

return humanSize;
    },
    "inherits": function(require) {
function inherits(ctor, superCtor) {
  ctor.super_ = superCtor;
  ctor.prototype = Object.create(superCtor.prototype, {
    constructor: {
      value: ctor,
      enumerable: false,
      writable: true,
      configurable: true,
    },
  });
};

return inherits;
    },
    "keese": function(require) {
// https://github.com/thejoshwolfe/node-keese

// the basic characters in sorted order
var alphabet = "0123456789?@ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
var radix = alphabet.length;
// bigger than all the basic characters
var order_specifier = "~";

// character to numerical value aka index of the character
// "0": 0, "z": 63, etc.
var values = (function() {
  var values = {};
  for (var i = 0; i < alphabet.length; i++) values[alphabet[i]] = i;
  return values;
})();

function keese(low, high, count) {
  if (count != null) {
    return multi_keese(low, high, count);
  } else {
    return single_keese(low, high);
  }
}
function single_keese(low, high) {
  if (low == null) {
    if (high == null) {
      // return anything above 0
      return "1";
    } else {
      // go smaller
      return average("0", high);
    }
  } else {
    if (high == null) {
      // go bigger
      return increment(low);
    } else {
      // go in between
      return average(low, high);
    }
  }
}
function multi_keese(low, high, count) {
  var result = new Array(count);
  if (count > 0) {
    if (high == null) {
      // just allocate straight forward
      for (var i = 0; i < count; i++) {
        var value = keese(low, null);
        result[i] = value;
        low = value;
      }
    } else {
      // binary tree descent
      recurse(low, high, 0, count);
    }
  }
  return result;
  function recurse(low_value, high_value, low_index, high_index) {
    var mid_index = Math.floor((low_index + high_index) / 2);
    var mid_value = single_keese(low_value, high_value);
    result[mid_index] = mid_value;
    if (low_index < mid_index) recurse(low_value, mid_value, low_index, mid_index);
    if (mid_index + 1 < high_index) recurse(mid_value, high_value, mid_index + 1, high_index);
  }
}

function increment(value) {
  var n = parse(value);
  // drop the fraction
  n.digits = n.digits.substr(0, n.order_length + 1);
  return add(n, parse("1"));
}

function average(low, high) {
  if (!(low < high)) {
    throw new Error("assertion failed: " + JSON.stringify(low) + " < " + JSON.stringify(high));
  }
  var a = parse(low);
  var b = parse(high);
  pad_to_equal_order(a, b);
  var b_carry = 0;
  var max_digit_length = Math.max(a.digits.length, b.digits.length);
  for (var i = 0; i < max_digit_length || b_carry > 0; i++) {
    var a_value =            values[a.digits[i]] || 0;
    var b_value = b_carry + (values[b.digits[i]] || 0);
    if (a_value === b_value) continue;
    if (a_value === b_value - 1) {
      // we need more digits, but remember that b is ahead
      b_carry = radix;
      continue;
    }
    // we have a distance of at least 2 between the values.
    // half the distance floored is sure to be a positive single digit.
    var half_distance_value = Math.floor((b_value - a_value) / 2);
    var half_distance_digits = "";
    for (var j = 0; j < i; j++)
      half_distance_digits += "0";
    half_distance_digits += alphabet[half_distance_value];
    var half_distance = parse(construct(a.order_length, half_distance_digits));
    // truncate insignificant digits of a
    a.digits = a.digits.substr(0, i + 1);
    return add(a, half_distance);
  }
  throw new Error; // unreachable
}

function add(a, b) {
  pad_to_equal_order(a, b);
  var result_digits = "";
  var order_length = a.order_length;
  var value = 0;
  for (var i = Math.max(a.digits.length, b.digits.length) - 1; i >= 0; i--) {
    value += values[a.digits[i]] || 0;
    value += values[b.digits[i]] || 0;
    result_digits = alphabet[value % radix] + result_digits;
    value = Math.floor(value / radix);
  }
  // overflow up to moar digits
  while (value > 0) {
    result_digits = alphabet[value % radix] + result_digits;
    value = Math.floor(value / radix);
    order_length++;
  }
  return construct(order_length, result_digits);
}

function parse(value) {
  var order_length = value.lastIndexOf(order_specifier) + 1;
  return {
    order_length: order_length,
    digits: value.substr(order_length)
  };
}
function construct(order_length, digits) {
  // strip unnecessary leading zeros
  while (order_length > 0 && digits.charAt(0) == "0") {
    digits = digits.substr(1);
    order_length--;
  }
  var result = "";
  for (var i = 0; i < order_length; i++)
    result += order_specifier;
  return result + digits;
}

function pad_to_equal_order(a, b) {
  pad_in_place(a, b.order_length);
  pad_in_place(b, a.order_length);
}
function pad_in_place(n, order_length) {
  while (n.order_length < order_length) {
    n.digits = "0" + n.digits;
    n.order_length++;
  }
}

return keese;
    },
    "music-library-index": function(require) {
// https://github.com/andrewrk/node-music-library-index

var removeDiacritics = require('removediacritics');

MusicLibraryIndex.defaultPrefixesToStrip = [
  /^\s*the\s+/,
  /^\s*a\s+/,
  /^\s*an\s+/,
];
MusicLibraryIndex.defaultVariousArtistsKey = "VariousArtists";
MusicLibraryIndex.defaultVariousArtistsName = "Various Artists";
MusicLibraryIndex.defaultSearchFields = [
  'artistName',
  'albumArtistName',
  'albumName',
  'name',
];

function MusicLibraryIndex(options) {
  options = options || {};
  this.searchFields = options.searchFields || MusicLibraryIndex.defaultSearchFields;
  this.variousArtistsKey = options.variousArtistsKey || MusicLibraryIndex.defaultVariousArtistsKey;
  this.variousArtistsName = options.variousArtistsName || MusicLibraryIndex.defaultVariousArtistsName;
  this.prefixesToStrip = options.prefixesToStrip || MusicLibraryIndex.defaultPrefixesToStrip;

  this.artistComparator = this.artistComparator.bind(this);
  this.albumComparator = this.albumComparator.bind(this);
  this.trackComparator = this.trackComparator.bind(this);
  this.labelComparator = this.labelComparator.bind(this);
  this.clearTracks();
  this.clearLabels();
}

MusicLibraryIndex.prototype.stripPrefixes = function(str) {
  for (var i = 0; i < this.prefixesToStrip.length; i += 1) {
    var regex = this.prefixesToStrip[i];
    str = str.replace(regex, '');
    break;
  }
  return str;
};

MusicLibraryIndex.prototype.sortableTitle = function(title) {
  return this.stripPrefixes(formatSearchable(title));
};

MusicLibraryIndex.prototype.titleCompare = function(a, b) {
  var _a = this.sortableTitle(a);
  var _b = this.sortableTitle(b);
  if (_a < _b) {
    return -1;
  } else if (_a > _b) {
    return 1;
  } else {
    if (a < b) {
      return -1;
    } else if (a > b) {
      return 1;
    } else {
      return 0;
    }
  }
};

MusicLibraryIndex.prototype.trackComparator = function(a, b) {
  if (a.disc < b.disc) {
    return -1;
  } else if (a.disc > b.disc) {
    return 1;
  } else if (a.track < b.track) {
    return -1;
  } else if (a.track > b.track) {
    return 1;
  } else {
    return this.titleCompare(a.name, b.name);
  }
}

MusicLibraryIndex.prototype.albumComparator = function(a, b) {
  if (a.year < b.year) {
    return -1;
  } else if (a.year > b.year) {
    return 1;
  } else {
    return this.titleCompare(a.name, b.name);
  }
}

MusicLibraryIndex.prototype.artistComparator = function(a, b) {
  return this.titleCompare(a.name, b.name);
}

MusicLibraryIndex.prototype.labelComparator = function(a, b) {
  return this.titleCompare(a.name, b.name);
}

MusicLibraryIndex.prototype.getAlbumKey = function(track) {
  var artistName = track.albumArtistName ||
    (track.compilation ? this.variousArtistsName : track.artistName);
  return formatSearchable(track.albumName + "\n" + artistName);
};

MusicLibraryIndex.prototype.getArtistKey = function(artistName) {
  return formatSearchable(artistName);
};

MusicLibraryIndex.prototype.clearTracks = function() {
  this.trackTable = {};
  this.artistTable = {};
  this.artistList = [];
  this.albumTable = {};
  this.albumList = [];
  this.dirtyTracks = false;
};

MusicLibraryIndex.prototype.clearLabels = function() {
  this.labelTable = {};
  this.labelList = [];
  this.dirtyLabels = false;
};

MusicLibraryIndex.prototype.rebuildAlbumTable = function() {
  // builds everything from trackTable
  this.artistTable = {};
  this.artistList = [];
  this.albumTable = {};
  this.albumList = [];
  var thisAlbumList = this.albumList;
  for (var trackKey in this.trackTable) {
    var track = this.trackTable[trackKey];
    this.trackTable[track.key] = track;

    var searchTags = "";
    for (var i = 0; i < this.searchFields.length; i += 1) {
      searchTags += track[this.searchFields[i]] + "\n";
    }
    track.exactSearchTags = searchTags;
    track.fuzzySearchTags = formatSearchable(searchTags);

    if (track.albumArtistName === this.variousArtistsName) {
      track.albumArtistName = "";
      track.compilation = true;
    }
    track.albumArtistName = track.albumArtistName || "";

    var albumKey = this.getAlbumKey(track);
    var album = getOrCreate(albumKey, this.albumTable, createAlbum);
    track.album = album;
    album.trackList.push(track);
    if (album.year == null) {
      album.year = track.year;
    }
  }

  function createAlbum() {
    var album = {
      name: track.albumName,
      year: track.year,
      trackList: [],
      key: albumKey,
    };
    thisAlbumList.push(album);
    return album;
  }
};

MusicLibraryIndex.prototype.rebuildTracks = function() {
  if (!this.dirtyTracks) return;
  this.rebuildAlbumTable();
  this.albumList.sort(this.albumComparator);

  var albumArtistName, artistKey, artist;
  var albumKey, track, album;
  var i;
  for (albumKey in this.albumTable) {
    album = this.albumTable[albumKey];
    var albumArtistSet = {};
    album.trackList.sort(this.trackComparator);
    albumArtistName = "";
    var isCompilation = false;
    for (i = 0; i < album.trackList.length; i += 1) {
      track = album.trackList[i];
      track.index = i;
      if (track.albumArtistName) {
        albumArtistName = track.albumArtistName;
        albumArtistSet[this.getArtistKey(albumArtistName)] = true;
      }
      if (!albumArtistName) albumArtistName = track.artistName;
      albumArtistSet[this.getArtistKey(albumArtistName)] = true;
      isCompilation = isCompilation || track.compilation;
    }
    if (isCompilation || moreThanOneKey(albumArtistSet)) {
      albumArtistName = this.variousArtistsName;
      artistKey = this.variousArtistsKey;
      for (i = 0; i < album.trackList.length; i += 1) {
        track = album.trackList[i];
        track.compilation = true;
      }
    } else {
      artistKey = this.getArtistKey(albumArtistName);
    }
    artist = getOrCreate(artistKey, this.artistTable, createArtist);
    album.artist = artist;
    artist.albumList.push(album);
  }

  this.artistList = [];
  var variousArtist = null;
  for (artistKey in this.artistTable) {
    artist = this.artistTable[artistKey];
    artist.albumList.sort(this.albumComparator);
    for (i = 0; i < artist.albumList.length; i += 1) {
      album = artist.albumList[i];
      album.index = i;
    }
    if (artist.key === this.variousArtistsKey) {
      variousArtist = artist;
    } else {
      this.artistList.push(artist);
    }
  }
  this.artistList.sort(this.artistComparator);
  if (variousArtist) {
    this.artistList.unshift(variousArtist);
  }
  for (i = 0; i < this.artistList.length; i += 1) {
    artist = this.artistList[i];
    artist.index = i;
  }

  this.dirtyTracks = false;

  function createArtist() {
    return {
      name: albumArtistName,
      albumList: [],
      key: artistKey,
    };
  }
}

MusicLibraryIndex.prototype.rebuildLabels = function() {
  if (!this.dirtyLabels) return;

  this.labelList = [];
  for (var id in this.labelTable) {
    var label = this.labelTable[id];
    this.labelList.push(label);
  }

  this.labelList.sort(this.labelComparator);
  this.labelList.forEach(function(label, index) {
    label.index = index;
  });

  this.dirtyLabels = false;
}

MusicLibraryIndex.prototype.addTrack = function(track) {
  this.trackTable[track.key] = track;
  this.dirtyTracks = true;
}

MusicLibraryIndex.prototype.removeTrack = function(key) {
  delete this.trackTable[key];
  this.dirtyTracks = true;
}

MusicLibraryIndex.prototype.addLabel = function(label) {
  this.labelTable[label.id] = label;
  this.dirtyLabels = true;
}

MusicLibraryIndex.prototype.removeLabel = function(id) {
  delete this.labelTable[id];
  this.dirtyLabels = true;
}

MusicLibraryIndex.prototype.search = function(query) {
  var searchResults = new MusicLibraryIndex({
    searchFields: this.searchFields,
    variousArtistsKey: this.variousArtistsKey,
    variousArtistsName: this.variousArtistsName,
    prefixesToStrip: this.prefixesToStrip,
  });

  var matcher = this.parseQuery(query);

  var track;
  for (var trackKey in this.trackTable) {
    track = this.trackTable[trackKey];
    if (matcher(track)) {
      searchResults.trackTable[track.key] = track;
    }
  }
  searchResults.dirtyTracks = true;
  searchResults.rebuildTracks();

  return searchResults;

};

var tokenizerRegex = new RegExp(
  '( +)'                        +'|'+ // 1: whitespace between terms (not in quotes)
  '(\\()'                       +'|'+ // 2: open parenthesis at the start of a term
  '(\\))'                       +'|'+ // 3: end parenthesis
  '(not:)'                      +'|'+ // 4: not: prefix
  '(or:\\()'                    +'|'+ // 5: or: prefix
  '(label:)'                    +'|'+ // 6: label: prefix
  '("(?:[^"\\\\]|\\\\.)*"\\)*)' +'|'+ // 7: quoted thing. can end with parentheses
  '([^ ]+)',                          // 8: normal word. can end with parentheses
  "g");
var WHITESPACE = 1;
var OPEN_PARENTHESIS = 2;
var CLOSE_PARENTHESIS = 3;
var NOT = 4;
var OR = 5;
var LABEL = 6;
var QUOTED_THING = 7;
var NORMAL_WORD = 8;
MusicLibraryIndex.prototype.parseQuery = function(query) {
  var self = this;
  return parse(query);

  function parse(query) {
    var tokens = tokenizeQuery(query);
    var tokenIndex = 0;
    return parseList(makeAndMatcher, null);

    function parseList(makeMatcher, waitForTokenType) {
      var matchers = [];
      var justSawWhitespace = true;
      while (tokenIndex < tokens.length) {
        var token = tokens[tokenIndex++];
        switch (token.type) {
          case OPEN_PARENTHESIS:
            var subMatcher = parseList(makeAndMatcher, CLOSE_PARENTHESIS);
            matchers.push(subMatcher);
            break;
          case CLOSE_PARENTHESIS:
            if (waitForTokenType === CLOSE_PARENTHESIS) return makeMatcher(matchers);
            // misplaced )
            var previousMatcher = matchers[matchers.length - 1];
            if (!justSawWhitespace && previousMatcher != null && previousMatcher.fuzzyTerm != null) {
              // slap it on the back of the last guy
              previousMatcher.fuzzyTerm += token.text;
            } else {
              // it's its own term
              matchers.push(makeFuzzyTextMatcher(token.text));
            }
            break;
          case NOT:
            matchers.push(parseNot());
            break;
          case OR:
            var subMatcher = parseList(makeOrMatcher, CLOSE_PARENTHESIS);
            matchers.push(subMatcher);
            break;
          case LABEL:
            matchers.push(parseLabel());
            break;
          case QUOTED_THING:
            if (token.text.length !== 0) {
              matchers.push(makeExactTextMatcher(token.text));
            }
            break;
          case NORMAL_WORD:
            matchers.push(makeFuzzyTextMatcher(token.text));
            break;
        }
        var justSawWhitespace = token.type === WHITESPACE;
      }
      return makeMatcher(matchers);
    }

    function parseNot() {
      if (tokenIndex >= tokens.length) {
        // "not:" then EOF. treat it as a fuzzy matcher for "not:"
        return makeFuzzyTextMatcher(tokens[tokenIndex - 1].text);
      }
      var token = tokens[tokenIndex++];
      switch (token.type) {
        case WHITESPACE:
        case CLOSE_PARENTHESIS:
          // "not: " or "not:)"
          // Treat the "not:" as a fuzzy matcher,
          // and let the parent deal with this token
          tokenIndex--;
          return makeFuzzyTextMatcher(tokens[tokenIndex - 1].text);
        case OPEN_PARENTHESIS:
          // "not:("
          return makeNotMatcher(parseList(makeAndMatcher, CLOSE_PARENTHESIS));
        case NOT:
          // double negative all the way.
          return makeNotMatcher(parseNot());
        case OR:
          // "not:or("
          return makeNotMatcher(parseList(makeOrMatcher, CLOSE_PARENTHESIS));
        case LABEL:
          return makeNotMatcher(parseLabel());
        case QUOTED_THING:
          return makeNotMatcher(makeExactTextMatcher(token.text));
        case NORMAL_WORD:
          return makeNotMatcher(makeFuzzyTextMatcher(token.text));
      }
      throw new Error("unreachable");
    }

    function parseLabel() {
      if (tokenIndex >= tokens.length) {
        // "label:" then EOF. treat it as a fuzzy matcher for "label:"
        return makeFuzzyTextMatcher(tokens[tokenIndex - 1].text);
      }
      var token = tokens[tokenIndex++];
      switch (token.type) {
        case WHITESPACE:
        case CLOSE_PARENTHESIS:
          // "label: " or "label:)"
          // Treat the "label:" as a fuzzy matcher,
          // and let the parent deal with this token
          tokenIndex--;
          return makeFuzzyTextMatcher(tokens[tokenIndex - 1].text);
        case OPEN_PARENTHESIS: // "label:("
        case NOT:              // "label:not:"
        case OR:               // "label:or:("
        case LABEL:            // "label:label:"
        case QUOTED_THING:     // 'label:"Asdf"'
        case NORMAL_WORD:      // "label:Asdf"
          return makeLabelMatcher(token.text);
      }
      throw new Error("unreachable");
    }
  }

  function makeFuzzyTextMatcher(term) {
    // make this publicly modifiable
    fuzzyTextMatcher.fuzzyTerm = formatSearchable(term);;
    fuzzyTextMatcher.toString = function() {
      return "(fuzzy " + JSON.stringify(fuzzyTextMatcher.fuzzyTerm) + ")"
    };
    return fuzzyTextMatcher;
    function fuzzyTextMatcher(track) {
      return track.fuzzySearchTags.indexOf(fuzzyTextMatcher.fuzzyTerm) !== -1;
    }
  }
  function makeExactTextMatcher(term) {
    exactTextMatcher.toString = function() {
      return "(exact " + JSON.stringify(term) + ")"
    };
    return exactTextMatcher;
    function exactTextMatcher(track) {
      return track.exactSearchTags.indexOf(term) !== -1;
    }
  }
  function makeAndMatcher(children) {
    if (children.length === 1) return children[0];
    andMatcher.toString = function() {
      return "(" + children.join(" AND ") + ")";
    };
    return andMatcher;
    function andMatcher(track) {
      for (var i = 0; i < children.length; i++) {
        if (!children[i](track)) return false;
      }
      return true;
    }
  }
  function makeOrMatcher(children) {
    if (children.length === 1) return children[0];
    orMatcher.toString = function() {
      return "(" + children.join(" OR ") + ")";
    };
    return orMatcher;
    function orMatcher(track) {
      for (var i = 0; i < children.length; i++) {
        if (children[i](track)) return true;
      }
      return false;
    }
  }
  function makeNotMatcher(subMatcher) {
    notMatcher.toString = function() {
      return "(not " + subMatcher.toString() + ")";
    };
    return notMatcher;
    function notMatcher(track) {
      return !subMatcher(track);
    }
  }
  function makeLabelMatcher(text) {
    var id = (function() {
      for (var id in self.labelTable) {
        if (self.labelTable[id].name === text) {
          return id;
        }
      }
      return null;
    })();
    if (id != null) {
      labelMatcher.toString = function() {
        return "(label " + JSON.stringify(id) + ")";
      };
      return labelMatcher;
    } else {
      // not even a real label
      alwaysFail.toString = function() {
        return "(label <none>)";
      };
      return alwaysFail;
    }

    function labelMatcher(track) {
      return track.labels != null && track.labels[id];
    }
    function alwaysFail() {
      return false;
    }
  }

  function tokenizeQuery(query) {
    tokenizerRegex.lastIndex = 0;
    var tokens = [];
    while (true) {
      var match = tokenizerRegex.exec(query);
      if (match == null) break;
      var term = match[0];
      var type;
      for (var i = 1; i < match.length; i++) {
        if (match[i] != null) {
          type = i;
          break;
        }
      }
      switch (type) {
        case WHITESPACE:
        case OPEN_PARENTHESIS:
        case CLOSE_PARENTHESIS:
        case NOT:
        case OR:
        case LABEL:
          tokens.push({type: type, text: term});
          break;
        case QUOTED_THING:
        case NORMAL_WORD:
          var endParensCount = /\)*$/.exec(term)[0].length;
          term = term.substr(0, term.length - endParensCount);
          if (type === QUOTED_THING) {
            // strip quotes
            term = /^"(.*)"$/.exec(term)[1];
            // handle escapes
            term = term.replace(/\\(.)/g, "$1");
          }
          tokens.push({type: type, text: term});
          for (var i = 0; i < endParensCount; i++) {
            tokens.push({type: CLOSE_PARENTHESIS, text: ")"});
          }
          break;
      }
    }
    return tokens;
  }

};

function getOrCreate(key, table, initObjFunc) {
  var result = table[key];
  if (result == null) {
    result = initObjFunc();
    table[key] = result;
  }
  return result;
}

function moreThanOneKey(object){
  var count = -2;
  for (var k in object) {
    if (!++count) {
      return true;
    }
  }
  return false;
}

function formatSearchable(str) {
  return removeDiacritics(str).toLowerCase();
}

return MusicLibraryIndex;
    },
    "removediacritics": function(require) {
// https://github.com/andrewrk/node-diacritics

var replacementList = [
  {
    base: ' ',
    chars: "\u00A0",
  }, {
    base: '0',
    chars: "\u07C0",
  }, {
    base: 'A',
    chars: "\u24B6\uFF21\u00C0\u00C1\u00C2\u1EA6\u1EA4\u1EAA\u1EA8\u00C3\u0100\u0102\u1EB0\u1EAE\u1EB4\u1EB2\u0226\u01E0\u00C4\u01DE\u1EA2\u00C5\u01FA\u01CD\u0200\u0202\u1EA0\u1EAC\u1EB6\u1E00\u0104\u023A\u2C6F",
  }, {
    base: 'AA',
    chars: "\uA732",
  }, {
    base: 'AE',
    chars: "\u00C6\u01FC\u01E2",
  }, {
    base: 'AO',
    chars: "\uA734",
  }, {
    base: 'AU',
    chars: "\uA736",
  }, {
    base: 'AV',
    chars: "\uA738\uA73A",
  }, {
    base: 'AY',
    chars: "\uA73C",
  }, {
    base: 'B',
    chars: "\u24B7\uFF22\u1E02\u1E04\u1E06\u0243\u0181",
  }, {
    base: 'C',
    chars: "\u24b8\uff23\uA73E\u1E08\u0106\u0043\u0108\u010A\u010C\u00C7\u0187\u023B",
  }, {
    base: 'D',
    chars: "\u24B9\uFF24\u1E0A\u010E\u1E0C\u1E10\u1E12\u1E0E\u0110\u018A\u0189\u1D05\uA779",
  }, {
    base: 'Dh',
    chars: "\u00D0",
  }, {
    base: 'DZ',
    chars: "\u01F1\u01C4",
  }, {
    base: 'Dz',
    chars: "\u01F2\u01C5",
  }, {
    base: 'E',
    chars: "\u025B\u24BA\uFF25\u00C8\u00C9\u00CA\u1EC0\u1EBE\u1EC4\u1EC2\u1EBC\u0112\u1E14\u1E16\u0114\u0116\u00CB\u1EBA\u011A\u0204\u0206\u1EB8\u1EC6\u0228\u1E1C\u0118\u1E18\u1E1A\u0190\u018E\u1D07",
  }, {
    base: 'F',
    chars: "\uA77C\u24BB\uFF26\u1E1E\u0191\uA77B",
  }, {
    base: 'G',
    chars: "\u24BC\uFF27\u01F4\u011C\u1E20\u011E\u0120\u01E6\u0122\u01E4\u0193\uA7A0\uA77D\uA77E\u0262",
  }, {
    base: 'H',
    chars: "\u24BD\uFF28\u0124\u1E22\u1E26\u021E\u1E24\u1E28\u1E2A\u0126\u2C67\u2C75\uA78D",
  }, {
    base: 'I',
    chars: "\u24BE\uFF29\xCC\xCD\xCE\u0128\u012A\u012C\u0130\xCF\u1E2E\u1EC8\u01CF\u0208\u020A\u1ECA\u012E\u1E2C\u0197",
  }, {
    base: 'J',
    chars: "\u24BF\uFF2A\u0134\u0248\u0237",
  }, {
    base: 'K',
    chars: "\u24C0\uFF2B\u1E30\u01E8\u1E32\u0136\u1E34\u0198\u2C69\uA740\uA742\uA744\uA7A2",
  }, {
    base: 'L',
    chars: "\u24C1\uFF2C\u013F\u0139\u013D\u1E36\u1E38\u013B\u1E3C\u1E3A\u0141\u023D\u2C62\u2C60\uA748\uA746\uA780",
  }, {
    base: 'LJ',
    chars: "\u01C7",
  }, {
    base: 'Lj',
    chars: "\u01C8",
  }, {
    base: 'M',
    chars: "\u24C2\uFF2D\u1E3E\u1E40\u1E42\u2C6E\u019C\u03FB",
  }, {
    base: 'N',
    chars: "\uA7A4\u0220\u24C3\uFF2E\u01F8\u0143\xD1\u1E44\u0147\u1E46\u0145\u1E4A\u1E48\u019D\uA790\u1D0E",
  }, {
    base: 'NJ',
    chars: "\u01CA",
  }, {
    base: 'Nj',
    chars: "\u01CB",
  }, {
    base: 'O',
    chars: "\u24C4\uFF2F\xD2\xD3\xD4\u1ED2\u1ED0\u1ED6\u1ED4\xD5\u1E4C\u022C\u1E4E\u014C\u1E50\u1E52\u014E\u022E\u0230\xD6\u022A\u1ECE\u0150\u01D1\u020C\u020E\u01A0\u1EDC\u1EDA\u1EE0\u1EDE\u1EE2\u1ECC\u1ED8\u01EA\u01EC\xD8\u01FE\u0186\u019F\uA74A\uA74C",
  }, {
    base: 'OE',
    chars: "\u0152",
  }, {
    base: 'OI',
    chars: "\u01A2",
  }, {
    base: 'OO',
    chars: "\uA74E",
  }, {
    base: 'OU',
    chars: "\u0222",
  }, {
    base: 'P',
    chars: "\u24C5\uFF30\u1E54\u1E56\u01A4\u2C63\uA750\uA752\uA754",
  }, {
    base: 'Q',
    chars: "\u24C6\uFF31\uA756\uA758\u024A",
  }, {
    base: 'R',
    chars: "\u24C7\uFF32\u0154\u1E58\u0158\u0210\u0212\u1E5A\u1E5C\u0156\u1E5E\u024C\u2C64\uA75A\uA7A6\uA782",
  }, {
    base: 'S',
    chars: "\u24C8\uFF33\u1E9E\u015A\u1E64\u015C\u1E60\u0160\u1E66\u1E62\u1E68\u0218\u015E\u2C7E\uA7A8\uA784",
  }, {
    base: 'T',
    chars: "\u24C9\uFF34\u1E6A\u0164\u1E6C\u021A\u0162\u1E70\u1E6E\u0166\u01AC\u01AE\u023E\uA786",
  }, {
    base: 'Th',
    chars: "\u00DE",
  }, {
    base: 'TZ',
    chars: "\uA728",
  }, {
    base: 'U',
    chars: "\u24CA\uFF35\xD9\xDA\xDB\u0168\u1E78\u016A\u1E7A\u016C\xDC\u01DB\u01D7\u01D5\u01D9\u1EE6\u016E\u0170\u01D3\u0214\u0216\u01AF\u1EEA\u1EE8\u1EEE\u1EEC\u1EF0\u1EE4\u1E72\u0172\u1E76\u1E74\u0244",
  }, {
    base: 'V',
    chars: "\u24CB\uFF36\u1E7C\u1E7E\u01B2\uA75E\u0245",
  }, {
    base: 'VY',
    chars: "\uA760",
  }, {
    base: 'W',
    chars: "\u24CC\uFF37\u1E80\u1E82\u0174\u1E86\u1E84\u1E88\u2C72",
  }, {
    base: 'X',
    chars: "\u24CD\uFF38\u1E8A\u1E8C",
  }, {
    base: 'Y',
    chars: "\u24CE\uFF39\u1EF2\xDD\u0176\u1EF8\u0232\u1E8E\u0178\u1EF6\u1EF4\u01B3\u024E\u1EFE",
  }, {
    base: 'Z',
    chars: "\u24CF\uFF3A\u0179\u1E90\u017B\u017D\u1E92\u1E94\u01B5\u0224\u2C7F\u2C6B\uA762",
  }, {
    base: 'a',
    chars: "\u24D0\uFF41\u1E9A\u00E0\u00E1\u00E2\u1EA7\u1EA5\u1EAB\u1EA9\u00E3\u0101\u0103\u1EB1\u1EAF\u1EB5\u1EB3\u0227\u01E1\u00E4\u01DF\u1EA3\u00E5\u01FB\u01CE\u0201\u0203\u1EA1\u1EAD\u1EB7\u1E01\u0105\u2C65\u0250\u0251",
  }, {
    base: 'aa',
    chars: "\uA733",
  }, {
    base: 'ae',
    chars: "\u00E6\u01FD\u01E3",
  }, {
    base: 'ao',
    chars: "\uA735",
  }, {
    base: 'au',
    chars: "\uA737",
  }, {
    base: 'av',
    chars: "\uA739\uA73B",
  }, {
    base: 'ay',
    chars: "\uA73D",
  }, {
    base: 'b',
    chars: "\u24D1\uFF42\u1E03\u1E05\u1E07\u0180\u0183\u0253\u0182",
  }, {
    base: 'c',
    chars: "\uFF43\u24D2\u0107\u0109\u010B\u010D\u00E7\u1E09\u0188\u023C\uA73F\u2184",
  }, {
    base: 'd',
    chars: "\u24D3\uFF44\u1E0B\u010F\u1E0D\u1E11\u1E13\u1E0F\u0111\u018C\u0256\u0257\u018B\u13E7\u0501\uA7AA",
  }, {
    base: 'dh',
    chars: "\u00F0",
  }, {
    base: 'dz',
    chars: "\u01F3\u01C6",
  }, {
    base: 'e',
    chars: "\u24D4\uFF45\u00E8\u00E9\u00EA\u1EC1\u1EBF\u1EC5\u1EC3\u1EBD\u0113\u1E15\u1E17\u0115\u0117\u00EB\u1EBB\u011B\u0205\u0207\u1EB9\u1EC7\u0229\u1E1D\u0119\u1E19\u1E1B\u0247\u01DD",
  }, {
    base: 'f',
    chars: "\u24D5\uFF46\u1E1F\u0192",
  }, {
    base: 'ff',
    chars: "\uFB00",
  }, {
    base: 'fi',
    chars: "\uFB01",
  }, {
    base: 'fl',
    chars: "\uFB02",
  }, {
    base: 'ffi',
    chars: "\uFB03",
  }, {
    base: 'ffl',
    chars: "\uFB04",
  }, {
    base: 'g',
    chars: "\u24D6\uFF47\u01F5\u011D\u1E21\u011F\u0121\u01E7\u0123\u01E5\u0260\uA7A1\uA77F\u1D79",
  }, {
    base: 'h',
    chars: "\u24D7\uFF48\u0125\u1E23\u1E27\u021F\u1E25\u1E29\u1E2B\u1E96\u0127\u2C68\u2C76\u0265",
  }, {
    base: 'hv',
    chars: "\u0195",
  }, {
    base: 'i',
    chars: "\u24D8\uFF49\xEC\xED\xEE\u0129\u012B\u012D\xEF\u1E2F\u1EC9\u01D0\u0209\u020B\u1ECB\u012F\u1E2D\u0268\u0131",
  }, {
    base: 'j',
    chars: "\u24D9\uFF4A\u0135\u01F0\u0249",
  }, {
    base: 'k',
    chars: "\u24DA\uFF4B\u1E31\u01E9\u1E33\u0137\u1E35\u0199\u2C6A\uA741\uA743\uA745\uA7A3",
  }, {
    base: 'l',
    chars: "\u24DB\uFF4C\u0140\u013A\u013E\u1E37\u1E39\u013C\u1E3D\u1E3B\u017F\u0142\u019A\u026B\u2C61\uA749\uA781\uA747\u026D",
  }, {
    base: 'lj',
    chars: "\u01C9",
  }, {
    base: 'm',
    chars: "\u24DC\uFF4D\u1E3F\u1E41\u1E43\u0271\u026F",
  }, {
    base: 'n',
    chars: "\u24DD\uFF4E\u01F9\u0144\xF1\u1E45\u0148\u1E47\u0146\u1E4B\u1E49\u019E\u0272\u0149\uA791\uA7A5\u043B\u0509",
  }, {
    base: 'nj',
    chars: "\u01CC",
  }, {
    base: 'o',
    chars: "\u24DE\uFF4F\xF2\xF3\xF4\u1ED3\u1ED1\u1ED7\u1ED5\xF5\u1E4D\u022D\u1E4F\u014D\u1E51\u1E53\u014F\u022F\u0231\xF6\u022B\u1ECF\u0151\u01D2\u020D\u020F\u01A1\u1EDD\u1EDB\u1EE1\u1EDF\u1EE3\u1ECD\u1ED9\u01EB\u01ED\xF8\u01FF\uA74B\uA74D\u0275\u0254\u1D11",
  }, {
    base: 'oe',
    chars: "\u0153",
  }, {
    base: 'oi',
    chars: "\u01A3",
  }, {
    base: 'oo',
    chars: "\uA74F",
  }, {
    base: 'ou',
    chars: "\u0223",
  }, {
    base: 'p',
    chars: "\u24DF\uFF50\u1E55\u1E57\u01A5\u1D7D\uA751\uA753\uA755\u03C1",
  }, {
    base: 'q',
    chars: "\u24E0\uFF51\u024B\uA757\uA759",
  }, {
    base: 'r',
    chars: "\u24E1\uFF52\u0155\u1E59\u0159\u0211\u0213\u1E5B\u1E5D\u0157\u1E5F\u024D\u027D\uA75B\uA7A7\uA783",
  }, {
    base: 's',
    chars: "\u24E2\uFF53\u015B\u1E65\u015D\u1E61\u0161\u1E67\u1E63\u1E69\u0219\u015F\u023F\uA7A9\uA785\u1E9B\u0282",
  }, {
    base: 'ss',
    chars: "\xDF",
  }, {
    base: 't',
    chars: "\u24E3\uFF54\u1E6B\u1E97\u0165\u1E6D\u021B\u0163\u1E71\u1E6F\u0167\u01AD\u0288\u2C66\uA787",
  }, {
    base: 'th',
    chars: "\u00FE",
  }, {
    base: 'tz',
    chars: "\uA729",
  }, {
    base: 'u',
    chars: "\u24E4\uFF55\xF9\xFA\xFB\u0169\u1E79\u016B\u1E7B\u016D\xFC\u01DC\u01D8\u01D6\u01DA\u1EE7\u016F\u0171\u01D4\u0215\u0217\u01B0\u1EEB\u1EE9\u1EEF\u1EED\u1EF1\u1EE5\u1E73\u0173\u1E77\u1E75\u0289",
  }, {
    base: 'v',
    chars: "\u24E5\uFF56\u1E7D\u1E7F\u028B\uA75F\u028C",
  }, {
    base: 'vy',
    chars: "\uA761",
  }, {
    base: 'w',
    chars: "\u24E6\uFF57\u1E81\u1E83\u0175\u1E87\u1E85\u1E98\u1E89\u2C73",
  }, {
    base: 'x',
    chars: "\u24E7\uFF58\u1E8B\u1E8D",
  }, {
    base: 'y',
    chars: "\u24E8\uFF59\u1EF3\xFD\u0177\u1EF9\u0233\u1E8F\xFF\u1EF7\u1E99\u1EF5\u01B4\u024F\u1EFF",
  }, {
    base: 'z',
    chars: "\u24E9\uFF5A\u017A\u1E91\u017C\u017E\u1E93\u1E95\u01B6\u0225\u0240\u2C6C\uA763",
  }
];

var diacriticsMap = {};
for (var i = 0; i < replacementList.length; i += 1) {
  var chars = replacementList[i].chars;
  for (var j = 0; j < chars.length; j += 1) {
    diacriticsMap[chars[j]] = replacementList[i].base;
  }
}

function removeDiacritics(str) {
  return str.replace(/[^\u0000-\u007e]/g, function(c) {
    return diacriticsMap[c] || c;
  });
}

return removeDiacritics;
    },
    "playerclient": function(require) {
var EventEmitter = require('event_emitter');
var inherits = require('inherits');
var uuid = require('uuid');
var MusicLibraryIndex = require('music-library-index');
var keese = require('keese');
var curlydiff = require('curlydiff');
var shuffle = require('shuffle');

var compareSortKeyAndId = makeCompareProps(['sortKey', 'id']);
var compareNameAndId = makeCompareProps(['name', 'id']);
var compareDates = makeCompareProps(['date', 'id']);

PlayerClient.REPEAT_OFF = 0;
PlayerClient.REPEAT_ALL = 1;
PlayerClient.REPEAT_ONE = 2;

PlayerClient.GUEST_USER_ID = "(guest)";

inherits(PlayerClient, EventEmitter);
function PlayerClient(socket) {
  EventEmitter.call(this);

  var self = this;
  self.socket = socket;
  self.serverTimeOffset = 0;
  self.serverTrackStartDate = null;

  self.queueFromServer = undefined;
  self.queueFromServerVersion = null;
  self.libraryFromServer = undefined;
  self.libraryFromServerVersion = null;
  self.scanningFromServer = undefined;
  self.scanningFromServerVersion = null;
  self.playlistsFromServer = undefined;
  self.playlistsFromServerVersion = null;
  self.labelsFromServer = undefined;
  self.labelsFromServerVersion = null;
  self.eventsFromServer = undefined;
  self.eventsFromServerVersion = null;
  self.usersFromServer = undefined;
  self.usersFromServerVersion = null;
  self.importProgressFromServer = undefined;
  self.importProgressFromServerVersion = null;

  self.resetServerState();
  self.socket.on('disconnect', function() {
    self.resetServerState();
  });
  if (self.socket.isConnected) {
    self.resubscribe();
  } else {
    self.socket.on('connect', self.resubscribe.bind(self));
  }
  self.socket.on('time', function(o) {
    self.serverTimeOffset = new Date(o) - new Date();
    self.updateTrackStartDate();
    self.sortEventsFromServer(); // because they rely on serverTimeOffset
    self.emit('statusUpdate');
  });
  self.socket.on('volume', function(volume) {
    self.volume = volume;
    self.emit('volumeUpdate');
  });
  self.socket.on('repeat', function(repeat) {
    self.repeat = repeat;
    self.emit('statusUpdate');
  });
  self.socket.on('anonStreamers', function(anonStreamers) {
    self.anonStreamers = anonStreamers;
    self.emit('anonStreamers');
  });

  self.socket.on('currentTrack', function(o) {
    self.isPlaying = o.isPlaying;
    self.serverTrackStartDate = o.trackStartDate && new Date(o.trackStartDate);
    self.pausedTime = o.pausedTime;
    self.currentItemId = o.currentItemId;
    self.updateTrackStartDate();
    self.updateCurrentItem();
    self.emit('statusUpdate');
    self.emit('currentTrack');
  });

  self.socket.on('queue', function(o) {
    if (o.reset) self.queueFromServer = undefined;
    self.queueFromServer = curlydiff.apply(self.queueFromServer, o.delta);
    self.queueFromServerVersion = o.version;
    self.updateQueueIndex();
    self.emit('statusUpdate');
    self.emit('queueUpdate');
  });

  self.socket.on('library', function(o) {
    if (o.reset) self.libraryFromServer = undefined;
    self.libraryFromServer = curlydiff.apply(self.libraryFromServer, o.delta);
    self.libraryFromServerVersion = o.version;
    self.library.clearTracks();
    for (var key in self.libraryFromServer) {
      var track = self.libraryFromServer[key];
      self.library.addTrack(track);
    }
    self.library.rebuildTracks();
    self.updateQueueIndex();
    self.haveFileListCache = true;
    var lastQuery = self.lastQuery;
    self.lastQuery = null;
    self.search(lastQuery);
  });

  self.socket.on('scanning', function(o) {
    if (o.reset) self.scanningFromServer = undefined;
    self.scanningFromServer = curlydiff.apply(self.scanningFromServer, o.delta);
    self.scanningFromServerVersion = o.version;
    self.emit('scanningUpdate');
  });

  self.socket.on('playlists', function(o) {
    if (o.reset) self.playlistsFromServer = undefined;
    self.playlistsFromServer = curlydiff.apply(self.playlistsFromServer, o.delta);
    self.playlistsFromServerVersion = o.version;
    self.updatePlaylistsIndex();
    self.emit('playlistsUpdate');
  });

  self.socket.on('labels', function(o) {
    if (o.reset) self.labelsFromServer = undefined;
    self.labelsFromServer = curlydiff.apply(self.labelsFromServer, o.delta);
    self.labelsFromServerVersion = o.version;
    self.updateLabelsIndex();
    self.emit('labelsUpdate');
  });

  self.socket.on('events', function(o) {
    if (o.reset) self.eventsFromServer = undefined;
    self.eventsFromServer = curlydiff.apply(self.eventsFromServer, o.delta);
    self.eventsFromServerVersion = o.version;
    self.sortEventsFromServer();
    if (o.reset) self.markAllEventsSeen();
    self.emit('events');
  });

  self.socket.on('users', function(o) {
    if (o.reset) self.usersFromServer = undefined;
    self.usersFromServer = curlydiff.apply(self.usersFromServer, o.delta);
    self.usersFromServerVersion = o.version;
    self.sortUsersFromServer();
    self.emit('users');
  });

  self.socket.on('importProgress', function(o) {
    if (o.reset) self.importProgressFromServer = undefined;
    self.importProgressFromServer = curlydiff.apply(self.importProgressFromServer, o.delta);
    self.importProgressFromServerVersion = o.version;
    self.sortImportProgressFromServer();
    self.emit('importProgress');
  });
}

PlayerClient.prototype.resubscribe = function(){
  this.sendCommand('subscribe', {
    name: 'labels',
    delta: true,
    version: this.labelsFromServerVersion,
  });
  this.sendCommand('subscribe', {
    name: 'library',
    delta: true,
    version: this.libraryFromServerVersion,
  });
  this.sendCommand('subscribe', {
    name: 'queue',
    delta: true,
    version: this.queueFromServerVersion,
  });
  this.sendCommand('subscribe', {
    name: 'scanning',
    delta: true,
    version: this.scanningFromServerVersion,
  });
  this.sendCommand('subscribe', {name: 'volume'});
  this.sendCommand('subscribe', {name: 'repeat'});
  this.sendCommand('subscribe', {name: 'currentTrack'});
  this.sendCommand('subscribe', {
    name: 'playlists',
    delta: true,
    version: this.playlistsFromServerVersion,
  });
  this.sendCommand('subscribe', {name: 'anonStreamers'});
  this.sendCommand('subscribe', {
    name: 'users',
    delta: true,
    version: this.usersFromServerVersion,
  });
  this.sendCommand('subscribe', {
    name: 'events',
    delta: true,
    version: this.eventsFromServerVersion,
  });
  this.sendCommand('subscribe', {
    name: 'importProgress',
    delta: true,
    version: this.importProgressFromServerVersion,
  });
};

PlayerClient.prototype.sortEventsFromServer = function() {
  this.eventsList = [];
  this.unseenChatCount = 0;
  for (var id in this.eventsFromServer) {
    var serverEvent = this.eventsFromServer[id];
    var seen = !!this.seenEvents[id];
    var ev = {
      id: id,
      date: new Date(new Date(serverEvent.date) - this.serverTimeOffset),
      type: serverEvent.type,
      sortKey: serverEvent.sortKey,
      text: serverEvent.text,
      pos: serverEvent.pos ? serverEvent.pos : 0,
      seen: seen,
      displayClass: serverEvent.displayClass,
      subCount: serverEvent.subCount ? serverEvent.subCount : 0,
    };
    if (!seen && serverEvent.type === 'chat') {
      this.unseenChatCount += 1;
    }
    if (serverEvent.trackId) {
      ev.track = this.library.trackTable[serverEvent.trackId];
    }
    if (serverEvent.userId) {
      ev.user = this.usersTable[serverEvent.userId];
    }
    if (serverEvent.playlistId) {
      ev.playlist = this.playlistTable[serverEvent.playlistId];
    }
    if (serverEvent.labelId) {
      ev.label = this.library.labelTable[serverEvent.labelId];
    }
    this.eventsList.push(ev);
  }
  this.eventsList.sort(compareSortKeyAndId);
};

PlayerClient.prototype.markAllEventsSeen = function() {
  this.seenEvents = {};
  for (var i = 0; i < this.eventsList.length; i += 1) {
    var ev = this.eventsList[i];
    this.seenEvents[ev.id] = true;
    ev.seen = true;
  }
  this.unseenChatCount = 0;
};

PlayerClient.prototype.sortUsersFromServer = function() {
  this.usersList = [];
  this.usersTable = {};
  for (var id in this.usersFromServer) {
    var serverUser = this.usersFromServer[id];
    var user = {
      id: id,
      name: serverUser.name,
      perms: serverUser.perms,
      requested: !!serverUser.requested,
      approved: !!serverUser.approved,
      streaming: !!serverUser.streaming,
      connected: !!serverUser.connected,
    };
    this.usersTable[id] = user;
    this.usersList.push(user);
  }
  this.usersList.sort(compareUserNames);
};

PlayerClient.prototype.sortImportProgressFromServer = function() {
  this.importProgressList = [];
  this.importProgressTable = {};
  for (var id in this.importProgressFromServer) {
    var ev = this.importProgressFromServer[id];
    var importEvent = {
      id: id,
      date: new Date(ev.date),
      filenameHintWithoutPath: ev.filenameHintWithoutPath,
      bytesWritten: ev.bytesWritten,
      size: ev.size,
    };
    this.importProgressTable[id] = importEvent;
    this.importProgressList.push(importEvent);
  }
  this.importProgressList.sort(compareDates);
};

PlayerClient.prototype.updateTrackStartDate = function() {
  this.trackStartDate = (this.serverTrackStartDate != null) ?
    new Date(new Date(this.serverTrackStartDate) - this.serverTimeOffset) : null;
};

PlayerClient.prototype.updateCurrentItem = function() {
  this.currentItem = (this.currentItemId != null) ?
    this.queue.itemTable[this.currentItemId] : null;
};

PlayerClient.prototype.clearPlaylists = function() {
  this.playlistTable = {};
  this.playlistItemTable = {};
  this.playlistList = [];
};

PlayerClient.prototype.sortAndIndexPlaylists = function() {
  this.playlistList.sort(compareNameAndId);
  this.playlistList.forEach(function(playlist, index) {
    playlist.index = index;
  });
};

PlayerClient.prototype.updatePlaylistsIndex = function() {
  this.clearPlaylists();
  if (!this.playlistsFromServer) return;
  for (var id in this.playlistsFromServer) {
    var playlistFromServer = this.playlistsFromServer[id];
    var playlist = {
      itemList: [],
      itemTable: {},
      id: id,
      name: playlistFromServer.name,
      mtime: playlistFromServer.mtime,
      index: 0, // we'll set this correctly later
    };
    for (var itemId in playlistFromServer.items) {
      var itemFromServer = playlistFromServer.items[itemId];
      var track = this.library.trackTable[itemFromServer.key];
      var item = {
        id: itemId,
        sortKey: itemFromServer.sortKey,
        isRandom: false,
        track: track,
        playlist: playlist,
      };
      playlist.itemTable[itemId] = item;
      this.playlistItemTable[itemId] = item;
    }
    this.refreshPlaylistList(playlist);
    this.playlistList.push(playlist);
    this.playlistTable[playlist.id] = playlist;
  }
  this.sortAndIndexPlaylists();
};

PlayerClient.prototype.updateLabelsIndex = function() {
  this.library.clearLabels();
  if (!this.labelsFromServer) return;
  for (var id in this.labelsFromServer) {
    var labelFromServer = this.labelsFromServer[id];
    var label = {
      id: id,
      name: labelFromServer.name,
      color: labelFromServer.color,
      index: 0, // this gets set during rebuildLabels()
    };
    this.library.addLabel(label);
  }
  this.library.rebuildLabels();
};

PlayerClient.prototype.updateQueueIndex = function() {
  this.clearQueue();
  if (!this.queueFromServer) return;
  for (var id in this.queueFromServer) {
    var item = this.queueFromServer[id];
    var track = this.library.trackTable[item.key];
    this.queue.itemTable[id] = {
      id: id,
      sortKey: item.sortKey,
      isRandom: item.isRandom,
      track: track,
      playlist: this.queue,
    };
  }
  this.refreshPlaylistList(this.queue);
  this.updateCurrentItem();
};

PlayerClient.prototype.isScanning = function(track) {
  var scanInfo = this.scanningFromServer && this.scanningFromServer[track.key];
  return !!scanInfo;
};

PlayerClient.prototype.search = function(query) {
  query = query.trim();

  if (query === this.lastQuery) return;

  this.lastQuery = query;
  this.searchResults = this.library.search(query);
  this.emit('libraryUpdate');
};

PlayerClient.prototype.getDefaultQueuePosition = function() {
  var previousKey = this.currentItem && this.currentItem.sortKey;
  var nextKey = null;
  var startPos = this.currentItem ? this.currentItem.index + 1 : 0;
  for (var i = startPos; i < this.queue.itemList.length; i += 1) {
    var track = this.queue.itemList[i];
    var sortKey = track.sortKey;
    if (track.isRandom) {
      nextKey = sortKey;
      break;
    }
    previousKey = sortKey;
  }
  return {
    previousKey: previousKey,
    nextKey: nextKey
  };
};

PlayerClient.prototype.queueOnQueue = function(keys, previousKey, nextKey) {
  if (keys.length === 0) return;

  if (previousKey == null && nextKey == null) {
    var defaultPos = this.getDefaultQueuePosition();
    previousKey = defaultPos.previousKey;
    nextKey = defaultPos.nextKey;
  }

  var items = this.queueTracks(this.queue, keys, previousKey, nextKey);
  this.sendCommand('queue', items);
  this.emit('queueUpdate');
};

PlayerClient.prototype.queueOnPlaylist = function(playlistId, keys, previousKey, nextKey) {
  if (keys.length === 0) return;

  var playlist = this.playlistTable[playlistId];
  if (previousKey == null && nextKey == null && playlist.itemList.length > 0) {
    previousKey = playlist.itemList[playlist.itemList.length - 1].sortKey;
  }
  var items = this.queueTracks(playlist, keys, previousKey, nextKey);

  this.sendCommand('playlistAddItems', {
    id: playlistId,
    items: items,
  });

  this.emit('playlistsUpdate');
};

PlayerClient.prototype.renamePlaylist = function(playlist, newName) {
  playlist.name = newName;

  this.sendCommand('playlistRename', {
    id: playlist.id,
    name: playlist.name,
  });

  this.emit('playlistUpdate');
};

PlayerClient.prototype.queueTracks = function(playlist, keys, previousKey, nextKey) {
  var items = {}; // we'll send this to the server
  var sortKeys = keese(previousKey, nextKey, keys.length);
  for (var i = 0; i < keys.length; i += 1) {
    var key = keys[i];
    var sortKey = sortKeys[i];
    var id = uuid();
    items[id] = {
      key: key,
      sortKey: sortKey,
    };
    playlist[playlist.id] = {
      id: id,
      key: key,
      sortKey: sortKey,
      isRandom: false,
      track: this.library.trackTable[key],
    };
  }

  this.refreshPlaylistList(playlist);

  return items;
};

PlayerClient.prototype.queueTracksNext = function(keys) {
  var prevKey = this.currentItem && this.currentItem.sortKey;
  var nextKey = null;
  var itemList = this.queue.itemList;
  for (var i = 0; i < itemList.length; ++i) {
    var track = itemList[i];
    if (prevKey == null || track.sortKey > prevKey) {
      if (nextKey == null || track.sortKey < nextKey) {
        nextKey = track.sortKey;
      }
    }
  }
  this.queueOnQueue(keys, prevKey, nextKey);
};

PlayerClient.prototype.clear = function(){
  this.sendCommand('clear');
  this.clearQueue();
  this.emit('queueUpdate');
};

PlayerClient.prototype.play = function(){
  this.sendCommand('play');
  if (this.isPlaying === false) {
    this.trackStartDate = elapsedToDate(this.pausedTime);
    this.isPlaying = true;
    this.emit('statusUpdate');
  }
};

PlayerClient.prototype.stop = function(){
  this.sendCommand('stop');
  if (this.isPlaying === true) {
    this.pausedTime = 0;
    this.isPlaying = false;
    this.emit('statusUpdate');
  }
};

PlayerClient.prototype.pause = function(){
  this.sendCommand('pause');
  if (this.isPlaying === true) {
    this.pausedTime = dateToElapsed(this.trackStartDate);
    this.isPlaying = false;
    this.emit('statusUpdate');
  }
};

PlayerClient.prototype.next = function(){
  var index = this.currentItem ? this.currentItem.index + 1 : 0;

  // handle the case of Repeat All
  if (index >= this.queue.itemList.length &&
      this.repeat === PlayerClient.REPEAT_ALL)
  {
    index = 0;
  }

  var item = this.queue.itemList[index];
  var id = item && item.id;

  this.seek(id, 0);
};

PlayerClient.prototype.prev = function(){
  var index = this.currentItem ? this.currentItem.index - 1 : this.queue.itemList.length - 1;

  // handle case of Repeat All
  if (index < 0 && this.repeat === PlayerClient.REPEAT_ALL) {
    index = this.queue.itemList.length - 1;
  }

  var item = this.queue.itemList[index];
  var id = item && item.id;

  this.seek(id, 0);
};

PlayerClient.prototype.moveIds = function(trackIds, previousKey, nextKey){
  var track, i;
  var tracks = [];
  for (i = 0; i < trackIds.length; i += 1) {
    var id = trackIds[i];
    track = this.queue.itemTable[id];
    if (track) tracks.push(track);
  }
  tracks.sort(compareSortKeyAndId);
  var items = {};
  var sortKeys = keese(previousKey, nextKey, tracks.length);
  for (i = 0; i < tracks.length; i += 1) {
    track = tracks[i];
    var sortKey = sortKeys[i];
    items[track.id] = {
      sortKey: sortKey,
    };
    track.sortKey = sortKey;
    previousKey = sortKey;
  }
  this.refreshPlaylistList(this.queue);
  this.sendCommand('move', items);
  this.emit('queueUpdate');
};

PlayerClient.prototype.shuffleQueueItems = function(ids) {
  var items = shuffleIds(ids, this.queue.itemTable);
  this.refreshPlaylistList(this.queue);
  this.sendCommand('move', items);
  this.emit('queueUpdate');
};

PlayerClient.prototype.shufflePlaylists = function(playlistIdSet) {
  var updates = {};
  for (var playlistId in playlistIdSet) {
    var playlist = this.playlistTable[playlistId];
    var items = shuffleIds(Object.keys(playlist.itemTable), playlist.itemTable);
    updates[playlistId] = items;
    this.refreshPlaylistList(playlist);
  }

  this.sendCommand('playlistMoveItems', updates);
  this.emit('playlistsUpdate');
};

PlayerClient.prototype.shufflePlaylistItems = function(idSet) {
  var idLists = {};
  var idList;
  for (var id in idSet) {
    var item = this.playlistItemTable[id];
    idList = idLists[item.playlist.id] || (idLists[item.playlist.id] = []);
    idList.push(id);
  }
  var updates = {};
  for (var playlistId in idLists) {
    idList = idLists[playlistId];
    var playlist = this.playlistTable[playlistId];
    updates[playlistId] = shuffleIds(idList, playlist.itemTable);
    this.refreshPlaylistList(playlist);
  }
  this.sendCommand('playlistMoveItems', updates);
  this.emit('playlistsUpdate');
};

PlayerClient.prototype.playlistShiftIds = function(trackIdSet, offset) {
  var perPlaylistSet = {};
  var set;
  for (var trackId in trackIdSet) {
    var item = this.playlistItemTable[trackId];
    set = perPlaylistSet[item.playlist.id] || (perPlaylistSet[item.playlist.id] = {});
    set[trackId] = true;
  }

  var updates = {};
  for (var playlistId in perPlaylistSet) {
    set = perPlaylistSet[playlistId];
    var playlist = this.playlistTable[playlistId];
    updates[playlistId] = shiftIdsInPlaylist(this, playlist, set, offset);
  }

  this.sendCommand('playlistMoveItems', updates);
  this.emit('playlistsUpdate');
};

PlayerClient.prototype.shiftIds = function(trackIdSet, offset) {
  var movedItems = shiftIdsInPlaylist(this, this.queue, trackIdSet, offset);

  this.sendCommand('move', movedItems);
  this.emit('queueUpdate');
};

PlayerClient.prototype.removeIds = function(trackIds){
  if (trackIds.length === 0) return;

  var currentId = this.currentItem && this.currentItem.id;
  var currentIndex = this.currentItem && this.currentItem.index;
  var offset = 0;
  for (var i = 0; i < trackIds.length; i += 1) {
    var trackId = trackIds[i];
    if (trackId === currentId) {
      this.trackStartDate = new Date();
      this.pausedTime = 0;
    }
    var item = this.queue.itemTable[trackId];
    if (item.index < currentIndex) {
      offset -= 1;
    }
    delete this.queue.itemTable[trackId];
  }
  currentIndex += offset;
  this.refreshPlaylistList(this.queue);
  this.currentItem = (currentIndex == null) ? null : this.queue.itemList[currentIndex];
  this.currentItemId = this.currentItem && this.currentItem.id;

  this.sendCommand('remove', trackIds);
  this.emit('queueUpdate');
};

PlayerClient.prototype.removeItemsFromPlaylists = function(idSet) {
  var removals = {};
  var playlist;
  for (var playlistItemId in idSet) {
    var playlistItem = this.playlistItemTable[playlistItemId];
    playlist = playlistItem.playlist;
    var removal = removals[playlist.id];
    if (!removal) {
      removal = removals[playlist.id] = [];
    }
    removal.push(playlistItemId);

    delete playlist.itemTable[playlistItemId];
  }
  for (var playlistId in removals) {
    playlist = this.playlistTable[playlistId];
    this.refreshPlaylistList(playlist);
  }
  this.sendCommand('playlistRemoveItems', removals);
  this.emit('playlistsUpdate');
};

PlayerClient.prototype.deleteTracks = function(keysList) {
  this.sendCommand('deleteTracks', keysList);
  removeTracksInLib(this.library, keysList);
  removeTracksInLib(this.searchResults, keysList);

  var queueDirty = false;
  var dirtyPlaylists = {};
  for (var keysListIndex = 0; keysListIndex < keysList.length; keysListIndex += 1) {
    var key = keysList[keysListIndex];

    // delete items from the queue that are being deleted from the library
    var i;
    for (i = 0; i < this.queue.itemList.length; i += 1) {
      var queueItem = this.queue.itemList[i];
      if (queueItem.track.key === key) {
        delete this.queue.itemTable[queueItem.id];
        queueDirty = true;
      }
    }

    // delete items from playlists that are being deleted from the library
    for (var playlistIndex = 0; playlistIndex < this.playlistList.length; playlistIndex += 1) {
      var playlist = this.playlistList[playlistIndex];
      for (i = 0; i < playlist.itemList.length; i += 1) {
        var plItem = playlist.itemList[i];
        if (plItem.track.key === key) {
          delete playlist.itemTable[plItem.id];
          dirtyPlaylists[playlist.id] = playlist;
        }
      }
    }
  }
  if (queueDirty) {
    this.refreshPlaylistList(this.queue);
    this.emit('queueUpdate');
  }
  var anyDirtyPlaylists = false;
  for (var dirtyPlId in dirtyPlaylists) {
    var dirtyPlaylist = dirtyPlaylists[dirtyPlId];
    this.refreshPlaylistList(dirtyPlaylist);
    anyDirtyPlaylists = true;
  }
  if (anyDirtyPlaylists) {
    this.emit('playlistsUpdate');
  }

  this.emit('libraryUpdate');
};

PlayerClient.prototype.deletePlaylists = function(idSet) {
  var idList = Object.keys(idSet);
  if (idList.length === 0) return;
  this.sendCommand('playlistDelete', idList);
  for (var id in idSet) {
    var playlist = this.playlistTable[id];
    for (var j = 0; j < playlist.itemList; j += 1) {
      var item = playlist.itemList[j];
      delete this.playlistItemTable[item.id];
    }
    delete this.playlistTable[id];
    this.playlistList.splice(playlist.index, 1);
    for (j = playlist.index; j < this.playlistList.length; j += 1) {
      this.playlistList[j].index -= 1;
    }
  }
  this.emit('playlistsUpdate');
};

PlayerClient.prototype.seek = function(id, pos) {
  pos = parseFloat(pos || 0);
  var item = id ? this.queue.itemTable[id] : this.currentItem;
  if (item == null) return;
  if (pos < 0) pos = 0;
  if (pos > item.track.duration) pos = item.track.duration;
  this.sendCommand('seek', {
    id: item.id,
    pos: pos,
  });
  this.currentItem = item;
  this.currentItemId = item.id;
  this.duration = item.track.duration;
  if (this.isPlaying) {
    this.trackStartDate = elapsedToDate(pos);
  } else {
    this.pausedTime = pos;
  }
  this.emit('statusUpdate');
};

PlayerClient.prototype.setVolume = function(vol){
  if (vol > 2.0) vol = 2.0;
  if (vol < 0.0) vol = 0.0;
  this.volume = vol;
  this.sendCommand('setVolume', this.volume);
  this.emit('statusUpdate');
};

PlayerClient.prototype.setRepeatMode = function(mode) {
  this.repeat = mode;
  this.sendCommand('repeat', mode);
  this.emit('statusUpdate');
};

PlayerClient.prototype.sendCommand = function(name, args) {
  this.socket.send(name, args);
};

PlayerClient.prototype.clearQueue = function(){
  this.queue = {
    itemList: [],
    itemTable: {},
    index: null,
    name: null
  };
};

PlayerClient.prototype.refreshPlaylistList = function(playlist) {
  playlist.itemList = [];
  var item;
  for (var id in playlist.itemTable) {
    item = playlist.itemTable[id];
    item.playlist = playlist;
    playlist.itemList.push(item);
  }
  playlist.itemList.sort(compareSortKeyAndId);
  for (var i = 0; i < playlist.itemList.length; i += 1) {
    item = playlist.itemList[i];
    item.index = i;
  }
};

PlayerClient.prototype.resetServerState = function(){
  this.haveFileListCache = false;
  this.library = new MusicLibraryIndex({
    searchFields: MusicLibraryIndex.defaultSearchFields.concat('file'),
  });
  this.searchResults = this.library;
  this.lastQuery = "";
  this.clearQueue();
  this.repeat = 0;
  this.currentItem = null;
  this.currentItemId = null;
  this.anonStreamers = 0;
  this.usersList = [];
  this.usersTable = {};
  this.eventsList = [];
  this.seenEvents = {};
  this.unseenChatCount = 0;
  this.importProgressList = [];
  this.importProgressTable = {};

  this.clearPlaylists();
};

PlayerClient.prototype.createPlaylist = function(name) {
  var id = uuid();
  this.sendCommand('playlistCreate', {
    id: id,
    name: name,
  });
  // anticipate server response
  var playlist = {
    itemList: [],
    itemTable: {},
    id: id,
    name: name,
    index: 0,
  };
  this.playlistTable[id] = playlist;
  this.playlistList.push(playlist);
  this.sortAndIndexPlaylists();
  this.emit('playlistsUpdate');

  return playlist;
};

PlayerClient.prototype.removeLabel = function(labelId, keys) {
  if (keys.length === 0) return;

  var label = this.library.labelTable[labelId];

  var removals = {};
  for (var i = 0; i < keys.length; i += 1) {
    var key = keys[i];
    removals[key] = [labelId];
  }

  this.sendCommand('labelRemove', removals);

  // TODO anticipate server response
};

PlayerClient.prototype.updateLabelColor = function(labelId, color) {
  this.sendCommand('labelColorUpdate', {
    id: labelId,
    color: color,
  });
  // TODO anticipate server response
};

PlayerClient.prototype.renameLabel = function(labelId, name) {
  this.sendCommand('labelRename', {
    id: labelId,
    name: name,
  });
  // TODO anticipate server response
};

PlayerClient.prototype.addLabel = function(labelId, keys) {
  if (keys.length === 0) return;

  var label = this.library.labelTable[labelId];

  var additions = {};
  for (var i = 0; i < keys.length; i += 1) {
    var key = keys[i];
    additions[key] = [labelId];
  }

  this.sendCommand('labelAdd', additions);

  // TODO anticipate server response
};

PlayerClient.prototype.createLabel = function(name) {
  var id = uuid();
  this.sendCommand('labelCreate', {
    id: id,
    name: name,
  });
  // anticipate server response
  var label = {
    id: id,
    name: name,
    index: 0,
  };
  this.library.addLabel(label);
  this.library.rebuildLabels();
  this.emit('labelsUpdate');

  return label;
};

PlayerClient.prototype.deleteLabels = function(labelIds) {
  if (labelIds.length === 0) return;
  this.sendCommand('labelDelete', labelIds);
  // TODO anticipate server response
};

function shiftIdsInPlaylist(self, playlist, trackIdSet, offset) {
  // an example of shifting 5 items (a,c,f,g,i) "down":
  // offset: +1, reverse: false, this -> way
  // selection: *     *        *  *     *
  //    before: a, b, c, d, e, f, g, h, i
  //             \     \        \  \    |
  //              \     \        \  \   |
  //     after: b, a, d, c, e, h, f, g, i
  // selection:    *     *        *  *  *
  // (note that "i" does not move because it has no futher to go.)
  //
  // an alternate way to think about it: some items "leapfrog" backwards over the selected items.
  // this ends up being much simpler to compute, and even more compact to communicate.
  // selection: *     *        *  *     *
  //    before: a, b, c, d, e, f, g, h, i
  //              /     /        ___/
  //             /     /        /
  //     after: b, a, d, c, e, h, f, g, i
  // selection:    *     *        *  *  *
  // (note that the moved items are not the selected items)
  var itemList = playlist.itemList;
  var movedItems = {};
  var reverse = offset === -1;
  function getKeeseBetween(itemA, itemB) {
    if (reverse) {
      var tmp = itemA;
      itemA = itemB;
      itemB = tmp;
    }
    var keyA = itemA == null ? null : itemA.sortKey;
    var keyB = itemB == null ? null : itemB.sortKey;
    return keese(keyA, keyB);
  }
  if (reverse) {
    // to make this easier, just reverse the item list in place so we can write one iteration routine.
    // note that we are editing our data model live! so don't forget to refresh it later.
    itemList.reverse();
  }
  for (var i = itemList.length - 1; i >= 1; i--) {
    var track = itemList[i];
    if (!(track.id in trackIdSet) && (itemList[i - 1].id in trackIdSet)) {
      // this one needs to move backwards (e.g. found "h" is not selected, and "g" is selected)
      i--; // e.g. g
      i--; // e.g. f
      while (true) {
        if (i < 0) {
          // fell off the end (or beginning) of the list
          track.sortKey = getKeeseBetween(null, itemList[0]);
          break;
        }
        if (!(itemList[i].id in trackIdSet)) {
          // this is where it goes (e.g. found "d" is not selected)
          track.sortKey = getKeeseBetween(itemList[i], itemList[i + 1]);
          break;
        }
        i--;
      }
      movedItems[track.id] = {sortKey: track.sortKey};
      i++;
    }
  }
  // we may have reversed the table and adjusted all the sort keys, so we need to refresh this.
  self.refreshPlaylistList(playlist);
  return movedItems;
}

function shuffleIds(ids, table) {
  var sortKeys = [];
  var i, id, sortKey;
  for (i = 0; i < ids.length; i += 1) {
    id = ids[i];
    sortKey = table[id].sortKey;
    sortKeys.push(sortKey);
  }
  shuffle(sortKeys);
  var items = {};
  for (i = 0; i < ids.length; i += 1) {
    id = ids[i];
    sortKey = sortKeys[i];
    items[id] = {sortKey: sortKey};
    table[id].sortKey = sortKey;
  }
  return items;
}

function removeTracksInLib(lib, keysList) {
  keysList.forEach(function(key) {
    lib.removeTrack(key);
  });
  lib.rebuildTracks();
}

function elapsedToDate(elapsed){
  return new Date(new Date() - elapsed * 1000);
}

function dateToElapsed(date){
  return (new Date() - date) / 1000;
}

function noop(err){
  if (err) throw err;
}

function operatorCompare(a, b){
  if (a === b) {
    return 0;
  } else if (a < b) {
    return -1;
  } else {
    return 1;
  }
}

function makeCompareProps(props){
  return function(a, b) {
    for (var i = 0; i < props.length; i += 1) {
      var prop = props[i];
      var result = operatorCompare(a[prop], b[prop]);
      if (result) return result;
    }
    return 0;
  };
}

function compareUserNames(a, b) {
  var lowerA = a.name.toLowerCase();
  var lowerB = b.name.toLowerCase();
  if (a.id === PlayerClient.GUEST_USER_ID) {
    return -1;
  } else if (b.id === PlayerClient.GUEST_USER_ID) {
    return 1;
  } else if (lowerA < lowerB) {
    return -1;
  } else if (lowerA > lowerB) {
    return 1;
  } else {
    return 0;
  }
}

return PlayerClient;
    },
    "shuffle": function(require) {
// adapted from http://stackoverflow.com/questions/6274339/how-can-i-shuffle-an-array-in-javascript#6274398
function shuffle(array) {
    // Iterate backwards picking a random element to put into each slot.
    var counter = array.length;
    while (counter > 0) {
        var index = Math.floor(Math.random() * counter);
        counter--;

        var temp = array[counter];
        array[counter] = array[index];
        array[index] = temp;
    }
}

return shuffle;
    },
    "socket": function(require) {
var EventEmitter = require('event_emitter');
var inherits = require('inherits');

inherits(Socket, EventEmitter);
function Socket() {
  var self = this;
  EventEmitter.call(self);
  self.isConnected = false;
  createWs();

  function createWs() {
    var host = window.document.location.host;
    var pathname = window.document.location.pathname;
    var isHttps = window.document.location.protocol === 'https:';
    var match = host.match(/^(.+):(\d+)$/);
    var defaultPort = isHttps ? 443 : 80;
    var port = match ? parseInt(match[2], 10) : defaultPort;
    var hostName = match ? match[1] : host;
    var wsProto = isHttps ? "wss:" : "ws:";
    var wsUrl = wsProto + '//' + hostName + ':' + port + pathname;
    self.ws = new WebSocket(wsUrl);

    self.ws.addEventListener('message', onMessage, false);
    self.ws.addEventListener('error', timeoutThenCreateNew, false);
    self.ws.addEventListener('close', timeoutThenCreateNew, false);
    self.ws.addEventListener('open', onOpen, false);

    function onOpen() {
      self.isConnected = true;
      self.emit('connect');
    }

    function onMessage(ev) {
      var msg = JSON.parse(ev.data);
      self.emit(msg.name, msg.args);
    }

    function timeoutThenCreateNew() {
      self.ws.removeEventListener('error', timeoutThenCreateNew, false);
      self.ws.removeEventListener('close', timeoutThenCreateNew, false);
      self.ws.removeEventListener('open', onOpen, false);
      if (self.isConnected) {
        self.isConnected = false;
        self.emit('disconnect');
      }
      setTimeout(createWs, 1000);
    }
  }
}

Socket.prototype.send = function(name, args) {
  this.ws.send(JSON.stringify({
    name: name,
    args: args,
  }));
};

return Socket;
    },
    "uuid": function(require) {
// all these characters are safe to put in an HTML id
var b64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
var crypto = window.crypto;
var arr = new Uint8Array(24);
function uuid() {
  crypto.getRandomValues(arr);
  var s = "";
  for (var m = 0, t = 0; t < arr.length; m = (m + 1) % 4) {
    var x;
    if (m === 0) {
      x = arr[t] >> 2;
      t += 1;
    } else if (m === 1) {
      x = ((0x3 & arr[t-1]) << 4) | (arr[t] >> 4);
    } else if (m === 2) {
      x = ((0xf & arr[t]) << 2) | (arr[t+1] >> 6);
      t += 1;
    } else { // m === 3
      x = arr[t] & 0x3f;
      t += 1;
    }
    s += b64[x];
  }
  return s;
}

return uuid;
    },
});
