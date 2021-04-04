const writeFileAtomic = require('write-file-atomic');
const P2J = require('pipe2jpeg');
const pedestrianDetect = require('@erceth/pedestrian-detection');
const _ = require('lodash');

const previousDetectTimes = [];
const nPastDetectTimes = 5;

const args = process.argv.slice(2);
const index = args[0];
const resizeOutput = Number(args[1]);
const hitThreshold = Number(args[2]);
const winStride = {
  width: Number(args[3]),
  height: Number(args[3])
}
const padding = {
  width: Number(args[4]),
  height: Number(args[4])
}
const scale = Number(args[5]);

pedestrianDetect.optionalInit({rectanglesOnly: true, resizeOutput, hitThreshold, winStride, padding, scale});
const p2j = new P2J();

process.stdin.pipe(p2j);
p2j.on('jpeg', async (jpeg) => {
  if (!jpeg) {
    return;
  }
  let result = await pedestrianDetect.detect(jpeg);
  if (!result) {
    console.error('detect result empty');
    return;
  }

  writeFileAtomic(`output-detect${index}.png`, result.img, (error) => {
    if (error) {
      console.error('error boxes output:', error);
    }
  });

  if (result.found > 0) {
    process.stdout.write(String(result.found)); 
  }

  if (previousDetectTimes.length >= nPastDetectTimes) {
    previousDetectTimes.shift();
  }
  previousDetectTimes.push(result.time)
  const mean = _.meanBy(previousDetectTimes, time => Number(time[0] + '.' + time[1]));
  // console.error(`average of past ${nPastDetectTimes} times: ${mean}`);
});
