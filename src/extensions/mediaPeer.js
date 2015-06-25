/*
 * Copyright 2015 Paradone
 *
 * This file is part of Paradone <https://paradone.github.io>
 *
 * Paradone is free software: you can redistribute it and/or modify it under
 * the terms of the GNU Affero General Public License as published by the
 * Free Software Foundation, either version 3 of the License, or (at your
 * option) any later version.
 *
 * Paradone is distributed in the hope that it will be useful, but WITHOUT
 * ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
 * FITNESS FOR A PARTICULAR PURPOSE.  See the GNU Affero General Public
 * License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with Paradone.  If not, see <http://www.gnu.org/licenses/>.
 *
 * @flow weak
 */
'use strict'

import Media from './media.js'
import { contains, getURL, getRemoteFile, getRemoteFileWithStats } from '../util.js'
import { filter, forEach, merge, pipe } from 'ramda'
export default MediaPeer

/**
 * Set a new media we need to leech
 *
 * @function MediaPeer#addMedia
 * @param {string} sourceURL - URL for the file
 * @param {string} metafile - URL for the metadata
 * @param {HTMLMediaElement} tag - Element in which the media should be played
 * @param {boolean} autoload - Whether or not the file should be played when
 *        the download is over
 */
var addMedia = function(sourceURL, metaURL, tag, autoload) {
  // Track the file
  var media = new Media(sourceURL, tag, autoload)
  this.dispatchMessage({
    from: this.id,
    to: this.id,
    type: 'media:request-metadata',
    data: metaURL,
    url: sourceURL
  })

  this.files.set(sourceURL, media)
}

/**
 * Returns the next part a peer should ask based on the metadata of a media and
 * the already downloaded parts.
 *
 * @function MediaPeer#askForNextParts
 * @param {Media} media - Media file from which the peer possesses at-least the
 *        meta-data
 * @param {number} nbParts - number of parts to be returned
 */
var askForNextParts = function(media, nbParts) {
  /**
   * Returns a callback used to download a part from the server. When the part
   * is downloaded it is dispatched to the peer instance through a `part`
   * message.
   *
   * @param {Peer} peer
   * @param {number} partNumber
   * @return {Function}
   */
  var downloadFromServer = (peer, partNumber) => () => {
    var partRange = media.getRangeOfPart(partNumber)
    getRemoteFileWithStats(media.url, 'arraybuffer', partRange)
      .then(result => {
        let {data, bandwidth} = result
        // Dispatch the part
        peer.dispatchMessage({
          from: this.id,
          to: this.id,
          type: 'media:part',
          data: data,
          url: media.url,
          number: partNumber
        })
        // Dispatch the bandwidth value
        peer.dispatchMessage({
          from: this.id,
          to: this.id,
          type: 'gossip:bandwidth',
          data: bandwidth
        })
      })
  }

  var choices = media.nextPartsToDownload(nbParts)

  choices.forEach(choice => {
    this.send({
      type: 'media:request-part',
      from: this.id,
      to: choice.id,
      url: media.url,
      ttl: this.ttl,
      forwardBy: [],
      number: choice.partNumber
    }, MediaPeer.downloadTimeout, downloadFromServer(this, choice.partNumber))

    media.parts[choice.partNumber].status = 'pending'
  })
}

/**
 * Saves the received metadata and asks for the part used to initialized the
 * source buffer
 *
 * @param {Message.<media:metadata>} message
 * @param {Metadata} message.data
 */
var onmetadata = function(message) {
  var meta = message.data
  var url = message.url
  var media = this.files.get(url)
  media.setMetadata(meta)

  // We can start downloading the head
  this.dispatchMessage({
    from: this.id,
    to: this.id,
    type: 'media:request-head',
    data: '',
    url: url
  })
}

/**
 * Downloads metadata from the server
 *
 * @param {Message.<media:request-metadata>} message
 */
var onrequestmetadata = function(message) {
  var metaURL = message.data
  getRemoteFile(metaURL, 'json').then(meta => {
    meta.url = metaURL
    this.dispatchMessage({
      from: this.id,
      to: this.id,
      type: 'media:metadata',
      data: meta,
      url: message.url
    })
  })
}

/**
 * Saves the received head of the media and asks for the video parts
 *
 * @param {Message.<media:head>} message
 * @param {Array.<number>} message.data
 */
var onhead = function(message) {
  var head = message.data
  var url = message.url
  var media = this.files.get(url)
  media.appendHead(head)

  // We have the head, we can request random parts now
  askForNextParts.call(this, media, MediaPeer.concurrentParts)
}

/**
 * Downloads the "head" part of the video from the server
 *
 * @param {Message.<media:request-head>} message
 */
var onrequesthead = function(message) {
  let url = message.url
  let media = this.files.get(url)
  let range = media.getRangeOfHead()
  getRemoteFileWithStats(url, 'arraybuffer', range)
    .then(result => {
      let {data, bandwidth} = result

      this.dispatchMessage({
        from: this.id,
        to: this.id,
        type: 'media:head',
        url: url,
        data: data
      })

      this.dispatchMessage({
        from: this.id,
        to: this.id,
        type: 'gossip:bandwidth',
        data: bandwidth
      })
    })
}

/**
 * Message containing a part of the desired media
 *
 * @param {Message.<media:part>} message - A part type message containing a
 *        chunk of media
 * @param {Array} message.data - Array containing a chunk of media
 */
var onpart = function(message) {
  console.assert(this.files.has(message.url),
    'Message type:part received for an undesired file')

  var media = this.files.get(message.url)
  media.append(message.number, message.data)
  if(media.isComplete()) {
    this.dispatchMessage({
      type: 'media:complete',
      from: this.id,
      to: this.id,
      data: message.url
    })
  }
  // TODO (Storage) storeChunk(message.number, new Uint8Array(message.data))

  // Ask for a new part
  this.askForNextParts(media, 1)
}

/**
 * The remote peer requests some file part
 * We need to check if we have them and then we can send them
 *
 * @param {Message.<media:request-part>} message - A request for a chunk of a
 *        media
 */
var onrequestpart = function(message) {
  var media = this.files.get(message.url)
  var partNumber = message.number
  var chunks = media.getChunkedPart(MediaPeer.chunkSize, partNumber)
  var numberOfChunks = chunks.length
  chunks.forEach((chunk, id) => {
    this.respondTo(message, {
      type: 'media:part',
      number: message.number + ':' + id + ':' + numberOfChunks,
      data: chunk,
      url: message.url
    })
  })
}

/**
 * Parse the document and get all video elements
 *
 * @function MediaPeer#parseDocument
 */
var parseDocument = function() {
  // Check the video tag (not a real array)
  var videos = document.getElementsByTagName('video')
  var load = pipe(
    filter(video => video.hasAttribute('data-meta')),
    forEach(video => {
      var source = video.src
      var metaURL = getURL(video.getAttribute('data-meta'))
      // DEBUG Prevent firefox from downloading the video directly
      video.removeAttribute('src')
      this.addMedia(source, metaURL, video, true)
    })
  )
  load(videos)
}

/**
 * When a new part is received the MediaPeer will update the NodeDescriptor of
 * the peer in order to reflect this change on the partial views of other remote
 * peers
 *
 * @param {Message.<part>} message
 */
var updateGossipDescriptor = function(message) {
  var media = this.files.get(message.url)
  // Get already downloaded parts
  var parts = media.parts
    .filter(p => p.status === 'available' || p.status === 'added')
    .map(p => p.partNumber)

  // Add received part if it's not in there
  if(!contains(message.number, parts)) {
    parts.push(message.number)
  }

  // If the gossip extension is set this message will update the node descriptor
  this.dispatchMessage({
    from: this.id,
    to: this.id,
    type: 'gossip:descriptor-update',
    data: {
      path: ['media', message.url],
      value: parts
    }
  })
}

/**
 * Update the remote information of a media file when a new view is received
 *
 * @param {Message.<gossip:view-update>} message
 */
var updateRemoteInformation = function(message) {
  // Initial Data is
  // peer.view = [{ id: remote1,
  //               age: 7,
  //               media: {
  //                 'url1': [1,2,3,6],
  //                 'url2': [5] }}]
  // Transformed in
  // file.remotes = { remote1: [1,2,3,6],
  //                  remote2: [3,4] }
  var view = message.data
  this.files.forEach((file, url) => {
    var remotes = view
          // Keep the information if they contain `url`
          .filter(nd => nd.hasOwnProperty('media') &&
                  nd.media.hasOwnProperty(url))
          .map(nd => {
            // Create an object for each peer: { peerId: [partNumbers] }
            let result = {}
            result[nd.id] = nd.media[url]
            return result
          }) // Merge all objects
          .reduce(((acc, remote) => merge(acc, remote)), {})
    file.remotes = remotes
  })
}

/**
 * A media peer implements the functions used to share and retrieve media files
 * on the mesh
 *
 * @mixin MediaPeer
 * @extends Peer
 * @property {Media} files - Map of files indexed by url
 * @param {Object} options
 * @param {number} [options.downloadTimeout=5000] - Timeout after which the
 *        media should be downloaded from the server
 * @param {number} [options.concurrentParts=3] - Number of parts that should be
 *        downloaded simultaneously by the peer
 * @param {boolean} [options.autoload=false] - Automatically parse the document

 */
function MediaPeer(options) {

  this.on('media:request-metadata', onrequestmetadata)
  this.on('media:metadata', onmetadata)
  this.on('media:request-head', onrequesthead)
  this.on('media:head', onhead)
  this.on('media:request-part', onrequestpart)
  this.on('media:part', onpart)
  this.on('media:part', updateGossipDescriptor)

  this.on('gossip:view-update', updateRemoteInformation)

  this.files = new Map()
  this.askForNextParts = askForNextParts
  this.addMedia = addMedia
  this.parseDocument = parseDocument

  // TODO (Storage) Check out if there are any local files we can seed
  // MediaStore.forEachStoredMedia(media => this.files.set(media.url, media))

  if(options.hasOwnProperty('downloadTimeout')) {
    MediaPeer.downloadTimeout = options.downloadTimeout
  }

  if(options.hasOwnProperty('concurrentParts')) {
    MediaPeer.concurrentParts = options.concurrentParts
  }

  if(options.hasOwnProperty('autoload') && options.autoload) {
    this.parseDocument()
  }

  this.heavyTypes = this.heavyTypes || new Set()
  this.heavyTypes.add('media:request-part', 'media:part')
}

/**
 * How many parts the peer should download in parallel
 *
 * @name MediaPeer.concurrentParts
 * @type {number}
 */
MediaPeer.concurrentParts = 3

/**
 * Indicates how bug should the parts be if the file is splitted locally. We
 * want a size small enough to be transmitted through the DataChannel packet.
 *
 * @name MediaPeer.chunkSize
 * @type {number}
 * @see https://code.google.com/p/webrtc/issues/detail?id=2270#c35
 */
MediaPeer.chunkSize = 1000

/**
 * Timeout indicating how long the peer should wait for an answer from remote
 * peers before it downloads the file from the server. This value can be set
 * trough the parameter of the "media" extension. The value is in ms and the
 * default is 5000 (5 seconds)
 *
 * @name MediaPeer.downloadTimeout
 * @type {number}
 */
MediaPeer.downloadTimeout = 5000
