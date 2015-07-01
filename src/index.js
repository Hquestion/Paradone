/*!
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

// ES6 Polyfill
import 'babelify/polyfill'

import * as datachannel from './datachannel.js'
import Peer from './peer.js'
import PeerConnection from './peerConnection.js'
import Signal from './signal.js'
import * as util from './util.js'

var peer

// Export for the `paradone` module
export default {
  datachannel,
  Peer,
  PeerConnection,
  Signal,
  util,
  start,
  peer
}

/**
 * Default method initialising a new peer
 *
 * @function start
 * @param {Object} opts
 */
function start(opts) {
  document.addEventListener('DOMContentLoaded', function() {
    peer = new Peer(opts)
  })
}

// Additional type definitions

/**
 * @typedef {Object} Message
 * @desc Structure used to transmit information across the p2p network
 * @property {string} type - message type
 * @property {string} from - id of the sender
 * @property {string} to - id of the recipient (-1 for broadcast)
 * @property {number} ttl - "time to live", maximum number of forwarding
 * @property {Array.<string>} forwardBy - Id of peers which already have
 *           forwarded the message
 * @property {Object} [data] - Data of the message
 */
