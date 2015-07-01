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

import { contains, shuffleArray, error as errorHandler } from '../util.js'
import { assoc, find, flatten } from 'ramda'
export default Media

var MediaSource = window.MediaSource || window.WebKitMediaSource

/**
 * @typedef {Array.<number>} Chunk
 * @desc A chunk is a subsection of a video part. While parts represent
 *       meaningful media segments for the media player, chunks are used to
 *       respond to the size limitation of RTCDataChannel's messages.
 */

/**
 * @typedef {Object} Metadata
 * @desc Information about the video file downloaded from the server
 * @property {number} size - Total size in bytes of the file
 * @property {number} duration - Length in seconds of the video
 * @property {Array.<Metacluster>} clusters - Informations about video parts
 */

/**
 * @typedef {Object} Metacluster
 * @property {number} offset - Offset in bytes from the beginning of the file
 *           marking the beginning of the part
 * @property {number} timecode - Offset in secondes from the beginning of the
 *           video marking the beginning of the sequence
 */

/**
 * @typedef {Object} Part
 * @desc A segment of the video containing video data (no metadata about the
 *       video) and some information about the state of the part
 * @property {string} status - Indicates if the part has been processed or not.
 *           Possible values are:<ul>
 *           <li>`needed`: the part needs to be downloaded
 *           <li>`pending`: the peer is expecting the part to be received soon
 *           <li>`available`: the part has been downloaded and can be appended
 *           <li>`added`: the part has been appended to the source buffer
 * @property {number} partNumber - Identifier for a video part
 * @property {ArrayBuffer} buffer - Actual video data
 * @property {Array.<Chunk>} [chunks] - If a part is received in
 *           multiple chunks, the chunks will be stored here until the part is
 *           complete
 */

/**
 * @typedef {Array.<number>} Remote
 * @desc List of part identifer possessed by a given remote peer
 */

/**
 * Download, store, load and play a media file with local storage and
 * MediaSource
 *
 * @class Media
 * @param {string} sourceURL - Source URL of the media
 * @param {HTMLMediaElement} sourceTag - The tag where the media should be
 *        displayed
 * @param {boolean} [autoload=false] - Automatic play of the media
 *
 * @property {boolean} autoload - Automatic play of the media
 * @property {boolean} complete - Indicates if the file is complete or if the
 *           peer should ask from the missing parts
 * @property {MediaSource} mediaSource - Source providing the video to the html
             video player
 * @property {Metadata} metadata - Information about the media file
 * @property {Array.<Part>} parts - List of the 'video' parts of the media: A
 *           part that contains actual data and begins with a keyframe.
 * @property {Promise} promiseBuffer - Promise chain used to load the media
 * @property {Array.<Remote>} remotes - Media's meta-data
 * @property {SourceBuffer} sourceBuffer - Buffer where the parts are appended
 * @property {HTMLMediaElement} sourceTag - HTML element where hte media will
 *           be played
 * @property {string} url - Source URL of the media. It's used to identify the
 *           media on the mesh
 */
function Media(sourceURL, sourceTag, autoload = false) {
  this.url = sourceURL
  this.sourceTag = sourceTag
  this.remotes = {}
  this.complete = false
  this.autoload = autoload
  this.parts = [] // TODO Tricky indexes
}

/**
 * Action done when the file is complete. Here we start playing the media if
 * autoload is activated
 *
 * @function Media#isComplete
 * @return {boolean}
 */
Media.prototype.isComplete = function() {
  if(!this.complete) {
    this.complete =
      this.parts.reduce(((acc, p) => acc && p.status === 'added'), true)
  }
  return this.complete
}

/**
 * Select next missing parts. Ids of requested parts are stored until the part
 * is downloaded.
 *
 * @function Media#nextPartsToDownload
 * @param {number} howMany - How many missing parts should be returned
 * @return {Array.<Object.<id:string, partNumber:number>>} Array of tuples
 *         containing the remote id and its associated part number
 */
Media.prototype.nextPartsToDownload = function(howMany) {
  /**
   * Select one of the peers possessing a specific part of the media and return
   * its id
   *
   * @param {Remotes} remotes - Which chunk is available on which remote peer
   * @param {number} partNumber - The number of the chunk needed next
   * @return {string} Id of the remote peer or 'source' if the download should
   *         be made from the server
   */
  var selectPeer = function(remotes, partNumber) {
    // Get all random peers
    if(typeof remotes !== 'undefined') {
      var remoteIds = shuffleArray(Object.keys(remotes))
      // Take the first peer which has the desired part
      for(var j = 0; j < remoteIds.length; ++j) {
        var id = remoteIds[j]
        if(contains(partNumber, remotes[id])) {
          return id
        }
      }
    }
    return 'source'
  }

  return this.parts
    .filter(p => p.status === 'needed')
    .map(p => p.partNumber)
    .slice(0, howMany) // Keep the desired number of parts
    .map(pNbr => {
      return {
        id: selectPeer(this.remotes, pNbr),
        partNumber: pNbr
      }
    }) // Get a peer for each part
}

/**
 * Check if a particular part is available on peer side
 *
 * @function Media#peerHasPart
 * @param {number} partNumber
 * @return {boolean} True if the peer has the part
 */
Media.prototype.peerHasPart = function(partNumber) {
  var part = this.parts[partNumber]
  return typeof part !== 'undefined' &&
    (part.status === 'available' || part.status === 'added')
}

/**
 * Check if a remote peer has a particular part of a media. It is based on the
 * meta-data received through info-request and is not 100% accurate
 *
 * @function Media#remoteHasPart
 * @param {string} remotePeer - Which remote peer should be checked
 * @param {number} partNumber - Which part should be checked
 * @return {boolean} True if the remote peer seems to possess the part
 */
Media.prototype.remoteHasPart = function(remotePeer, partNumber) {
  var remote = this.remotes[remotePeer]
  return typeof remote !== 'undefined' && contains(partNumber, remote)
}

/**
 * @function Media#setMetadata
 * @param {Metadata} meta - Metadata of the media
 */
Media.prototype.setMetadata = function(meta) {
  this.metadata = meta
  for(let i = 0; i < meta.clusters.length; ++i) {
    this.parts[i] = {
      partNumber: i,
      status: 'needed'
    }
  }
  this.promiseBuffer = this.initSource(meta.codec)
}

/**
 * Returns the byte range associated with a given part number. The information
 * is extracted from the metadata.
 *
 * @function Media#getRangeOfPart
 * @param {number} partNumber - Number of the desired part
 * @return {string} The range for a HTTP RANGE request
 */
Media.prototype.getRangeOfPart = function(partNumber) {
  var meta = this.metadata
  var lastPart = meta.clusters.length - 1
  var range = meta.clusters[partNumber].offset + '-'
  if(partNumber === lastPart) {
    range += meta.size - 1
  } else {
    range += meta.clusters[partNumber + 1].offset - 1
  }
  return range
}

/**
 * Returns the byte range associated with the head of the video (before the
 * keyframes). The information is extracted from the metadata.
 *
 * @function Media#getRangeOfHead
 * @return {string} The range for a HTTP RANGE request
 */
Media.prototype.getRangeOfHead = function() {
  return '0-' + String(this.metadata.clusters[0].offset - 1)
}

/**
 * Uses the first part of the video file to initialize a media source and its
 * corresponding source buffer.
 *
 * @function Media#initSource
 */
Media.prototype.initSource = function(codec =
                                      'video/webm; codecs="vorbis, vp8"') {
  var video = this.sourceTag
  // When mediaSource is ready we append the parts in a new source buffer.
  return new Promise((resolve) => {
    var mediaSource = new MediaSource()
    mediaSource.addEventListener('sourceopen', () => {
      var sourceBuffer = mediaSource.addSourceBuffer(codec)
      this.sourceBuffer = sourceBuffer
      resolve(sourceBuffer)
    }, false)
    this.mediaSource = mediaSource
    // Triggers the "sourceopen" event of the MediaSource object
    video.src = window.URL.createObjectURL(mediaSource)
  })
}

/**
 * This function returns a Promise generator. The `buffer` argument contains the
 * data that should be appended to a `SourceBuffer` object. This function is
 * used to create a chain of promises allowing to safely append new buffers to a
 * source buffer. The `sourceBuffer` instance needs to be returned by the
 * `resolve` of the previous promise in the chain. The Promise will resolve when
 * the update of the source buffer has ended and will return the `sourceBuffer`.
 *
 * @param {ArrayBuffer|ArrayBufferView} buffer
 * @param {Array.<Part>} parts
 * @param {number} partNumber
 * @return {function(SourceBuffer):Promise<SourceBuffer>}
 */
var appendBuffer = function(buffer, parts, partNumber = '-1') {
  return function(sourceBuffer) {
    return new Promise(function(resolve) {
      sourceBuffer.addEventListener('updateend', function updateend() {
        // Resolve promise when the update is finished
        sourceBuffer.removeEventListener('updateend', updateend)
        if(partNumber !== -1 && typeof parts !== 'undefined') {
          parts[partNumber].status = 'added'
        }
        resolve(sourceBuffer)
      })
      sourceBuffer.appendBuffer(buffer)
    })
  }
}

/**
 * Appends the head to the source buffer. The `head` of the media gives the
 * required informations to the browser media player. The head has to be
 * appended to the source buffer before any other part.
 *
 * @function Media#appendHead
 * @param {ArrayBuffer} head - Every information contained from the start of the
 *        media file to start of the first cluster
 * @return {Promise<SourceBuffer>} A promise resolving to the updated source
 *         buffer allowing to chain media updates
 */
Media.prototype.appendHead = function(head) {
  this.head = head
  this.promiseBuffer = this.promiseBuffer.then(appendBuffer(head))
  return this.promiseBuffer
}

/**
 * Appends a new video part to the source buffer. If the buffer transmitted is a
 * full part it is instantly queued in the "Source Buffer Update Chain". In the
 * case where the data would be a chunk of a part, this chunk is stored until
 * the part is complete. If the metadata is correctly defined the part can be
 * appended (after the head of the media) in any order.
 *
 * @function Media#append
 * @param {number|string} number - Id for the part
 * @param {Array|ArrayBuffer} buffer - A part of the media
 * @return {Promise<SourceBuffer>} A promise resolving to the updated source
 *         buffer allowing to chain media updates
 */
Media.prototype.append = function(number, buffer) {
  var [ partNumber, chunkNumber, numberOfChunks ] =
        String(number).split(':').map(Number)
  var part = this.parts[partNumber]

  if(part.status !== 'pending') {
    throw new Error('Unexpected part has been received')
  }

  if(typeof chunkNumber !== 'undefined') {
    if(!part.hasOwnProperty('chunks')) {
      part.chunks = []
    }
    part.chunks[chunkNumber] = buffer
    part.numberOfChunks = numberOfChunks

    // Check if we have all chunks
    if(part.chunks.length === numberOfChunks) {
      // We need an ArrayBuffer or an ArrayBufferView
      part.buffer = new Uint8Array(flatten(part.chunks))
      part.status = 'available'
    }
  } else {
    // Full part
    part.buffer = new Uint8Array(buffer)
    part.status = 'available'
  }

  if(part.status === 'available') {
    this.promiseBuffer = this.promiseBuffer
      .then(appendBuffer(part.buffer, this.parts, partNumber))
      .then((sourceBuffer) => {
        if(this.isComplete()) {
          this.mediaSource.endOfStream()
        }
        return Promise.resolve(sourceBuffer)
      })
    let meta = this.metadata.clusters[partNumber]
    if(meta.hasOwnProperty('sha256')) {
      checkDigest(meta.sha256, part.buffer).then(result => {
        if(!result) {
          console.error('Invalid hash for part', partNumber)
        }
      })
    }
  }
  return this.promiseBuffer
}

/**
 * WebRTC prevents Datachannels messages to be greater than 64KB. This function
 * returns an ordered list of chunks composing the video part.
 *
 * @function Media#getChunkedPart
 * @param {number} chunkSize - Maximum size for a chunk
 * @param {number} partNumber - Id of the desired part
 * @return {Array.<Chunk>} The chunks are returned as Array instead of
 *         Uint8Array as they take less space when serialized as string
 */
Media.prototype.getChunkedPart = function(chunkSize, partNumber) {
  if(typeof this.parts[partNumber] !== 'undefined' &&
     contains(this.parts[partNumber].status, ['available', 'added'])) {
    var part = this.parts[partNumber].buffer
    var numberOfChunks = Math.ceil(part.byteLength / chunkSize)
    var chunks = []
    for(let i = 0; i < numberOfChunks; ++i) {
      // Chromium does not support #slice for TypedArray
      let chunk = part.subarray(i * chunkSize, (i + 1) * chunkSize)
      // Mesages will be smaller if we use arrays instead of typed arrays.
      // Spread operator iterates through all the values of the iterator
      chunks.push([...chunk.values()])
    }
    return chunks
  }
  return []
}

/**
 * Computes the SHA-256 digest of a part and check if it matches the digest
 * passed as argument. This can be used to check that the content of the media
 * has not been modified by a peer.
 *
 * @param {string} validDigest
 * @param {string} buffer
 * @param {boolean} [requireMatch=false]
 * @return {Promise<boolean>} A promise indicating if the two digests match
 */
var checkDigest = function(validDigest, buffer, requireMatch = false) {
  // TODO The digest should be computed by a Web Worker
  return window.crypto.subtle.digest('SHA-256', buffer)
    .then(digestBuffer => {
      var digest = ''
      var view = new DataView(digestBuffer)
      for(var i = 0; i < view.byteLength; i += 4) {
        // We use getUint32 to reduce the number of iterations
        var value = view.getUint32(i)
        // One Uint32 element is 4 bytes or 8 hex chars
        var padding = '00000000'
        // toString(16) will transform the integer into the corresponding hex
        // string but will remove any initial "0"
        var paddedValue = (padding + value.toString(16)).slice(-padding.length)
        digest += paddedValue
      }
      return digest
    })
    .then(computedDigest => validDigest === computedDigest)
    .catch(e => {
      if(e.code === e.NOT_SUPPORTED_ERR) {
        console.error('Sha256-digest unavailable:', e.message)
        return !requireMatch
      }
      throw e
    })
}
