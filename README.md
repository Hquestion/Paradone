# Paradone #

Paradone is an Open-Source, peer-to-peer powered overlay network for media
diffusion in the browser. Its aim is to reduce bandwidth cost of media file
diffusion for the server and ISPs while providing a better service quality to
the end user.

- It uses a mesh overlay network to share media directly between the users
- It uses the new WebRTC API to provide full P2P capabilities directly inside
  the web browser
- It uses the new Media Source Extension API to play video with HTML5
- It's a full JavaScript solution which needs no plugin and is invisible to end
  users
- It's Open-Source and free to use, share and modify

The project was created for and is laureate of the Boost Your Code 2014 contest.

Get more information about the project on:
- [the website](https://paradone.github.io/)
- [the wiki](https://github.com/Paradone/Paradone/wiki/)
- [the mailing list](https://sympa.inria.fr/sympa/info/paradone)
- [the issue tracker](https://github.com/Paradone/Paradone/issues)

## License ##

Paradone is licensed under the AGPLv3. See the [LICENSE](LICENSE) file for more
information.

## Getting Started ##

### Install ###

You can either download one of
[the releases](https://github.com/Paradone/Paradone/releases) or clone the
project and build the script from source with git and npm.

```bash
# Get the project
git clone https://github.com/Paradone/Paradone.git
cd Paradone
# Install dependencies
npm install
# Build the script
npm run build
```

Copy the file `./dist/paradone.min.js` in your project directory and add it to your
website.

```html
<script src="./some/path/to/paradone.min.js"></script>
<script>
  paradone.start(options)
</script>
```

The peer element should now be available as `paradone.peer`. You can also
directly create your own peer instance with `new paradone.Peer(options)`. The
`options` argument is the same as for `paradone.start`.


### Requirements ###

#### User side ####

The user will need an up-to-date web browser supporting both WebRTC and Media
Source Extension. It can either be Firefox, Google Chrome (or Chromium) or
Opera.

The video served to the client must be played within a HTML5 Video tag. You will
need to check the codec of your files.

Firefox users need to change the following options to be able to use MediaSource
with Paradone. The configuation options are available on the `about:config`
page. Available options may vary depending on the version of Firefox.

- Set `media.mediasource.webm.enabled` to `true`
- Set `media.mediasource.whitelist` to `false`
- Set `media.mediasource.youtubeonly` to `false`
- Set `media.mediasource.format-reader` to `false`

#### Server side ####

The system needs a signaling server allowing users to initiate the communication
between them. WebRTC lets you choose your preferred technology for signaling
(websocket, xhr, email...).

You can use the [tracker system](https://github.com/paradone/tracker) as [signaling
server](https://github.com/Paradone/Paradone/wiki/Signal).

#### Developer side ####

The project is written in JavaScript and uses [npm](https://npmjs.com) to manage
all dependencies.

Different scripts are available with `npm run <cmd>` where `<cmd>` can be one of
the following options:
- `build` Concatenate and minify the script to generate the file
  `dist/paradone.min.js`
- `clean` Remove temporary files and generated builds and doc
- `debug` Auto-build on file change with source-map support. Generates the file
  `dist/paradone.js`
- `doc`   Generate the documentation of the project in `doc/`
- `help`  Display the available commands and their description
- `test`  Run all tests once
- `watch` Run tests on each file change

### Usage ###

Every element of the project is referenced under the `paradone` namespace. Once
the `start` function called the script will find the video tags and share the
media between users through the mesh. You can pass options as arguments to the
`start` function, see the [API](https://paradone.github.io/api/)
for more detailed informations.
