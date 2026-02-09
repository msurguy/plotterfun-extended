// Webcam/video functions for Plotterfun

export function tabWebcam(video, webcam, imgselect, tab1, tab2, onSuccess) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    alert('could not open webcam');
    return;
  }

  navigator.mediaDevices
    .getUserMedia({ video: { width: 800 } })
    .then(function (v) {
      video.srcObject = v;
      webcam.style.display = 'block';
      imgselect.style.display = 'none';
      tab2.className = 'active';
      tab1.className = '';
      if (onSuccess) onSuccess();
    })
    .catch((e) => alert('error opening webcam'));
}

export function snapshot(video, canvas, ctx, onComplete, mirror = false) {
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  ctx.save();
  if (mirror) {
    ctx.scale(-1, 1);
    ctx.drawImage(video, -canvas.width, 0, canvas.width, canvas.height);
  } else {
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  }
  ctx.restore();
  if (onComplete) onComplete();
}

export function toggleVideoPause(video) {
  video.paused ? video.play() : video.pause();
}

export function stopWebcam(video) {
  if (video.srcObject && video.srcObject.getTracks().length) {
    video.srcObject.getTracks()[0].stop();
  }
}
