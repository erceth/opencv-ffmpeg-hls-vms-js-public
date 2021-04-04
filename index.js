const { spawn } = require('child_process');
const config = require('./config-server');
const _ = require('lodash');
const express = require('express')
const fs = require('fs');
const wfu = require('./watchFilesUtils');
const chokidar = require('chokidar');

const app = express()
const port = 3000
const TSFilesWithDetection = {};

_.forEach(config.cameras, (cam, index) => {
  removeOldRecordings(index);

  const outputDetect = `output-detect${index}.png`;
  if (!fs.existsSync(outputDetect)) {
    fs.copyFileSync('output-detect.png', outputDetect);
  }

  const cameraDir = `camera${index}`;
  if (!fs.existsSync(cameraDir)) {
    fs.mkdirSync(cameraDir);
  }

  const {width, hitThreshold, windowStride, padding, scale, fps} = cam.detectParameters;

  const streamInput = cam.input ? cam.input : `rtsp://${cam.ip}${cam.path}`;

  const command = []; //<--- insert ffmpeg command here

  if (cam.input) {
    command.unshift('-re')
  }

  // const stringCommand = command.join(' ');
  // console.log('ffmpeg arguments:', stringCommand);

  const ffmpegSpawn = spawn('ffmpeg', command);
  const detectSpawn = spawn('node', ['detect.js', index, width, hitThreshold, windowStride, padding, scale]);

  watchForTSFileRemoval(index);

  // images output on stdout
  ffmpegSpawn.stdout.on('data', (data) => {
    detectSpawn.stdin.write(data);
  })
  ffmpegSpawn.stderr.on('data', (data) => {
    // console.log('ffmpegStdErr', String(data));
  })
  ffmpegSpawn.on('close', (code) => {
     console.log(`ffmpeg child process exited with code ${code}`); // TODO: restart. End process and rely on pm2 to restart?
 });


  detectSpawn.stdout.on('data', async (data) => {
    const detectResponse = Number(data);

    const currentTransportFile = await wfu.getLatestTransportFile(index);
    TSFilesWithDetection[currentTransportFile] = detectResponse;
    // TODO: call function that writes detectResponse to JSON file
  })
  detectSpawn.stderr.on('data', (data) => {
    console.error('detectSpawn stderr', String(data));
  })
  detectSpawn.on('close', (code) => {
    console.log(`detectSpawn child process exited with code ${code}`); // TODO: respawn detect?
  });
});

app.get('/detect', (req, res) => {
  res.json(TSFilesWithDetection);
})

app.use(express.static(__dirname))

app.listen(port, () => {
  console.log(`Listening at http://localhost:${port}`)
})

function watchForTSFileRemoval(index) {
  chokidar.watch(`camera${index}`, {ignored: /(^|[\/\\])\../}).on('unlink', (removedFilePath) => {
    if (removedFilePath.match(/ts$/ig)) {
      const removedFile = _.last(removedFilePath.split('/'));
      delete TSFilesWithDetection[removedFile];
      // TODO: call function that writes detectResponse to JSON file
    }
  });
}

function removeOldRecordings(i) {
  try {
    fs.rmdirSync(`camera${i}`, { recursive: true });
    fs.unlinkSync(`camera${i}.m3u8`);
  } catch(err) {
    console.error(err)
  }
}
