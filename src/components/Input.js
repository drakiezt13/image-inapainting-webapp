import React, { useState, useRef, useEffect, useCallback } from 'react'
import ReactCrop, {
  centerCrop,
  makeAspectCrop,
} from 'react-image-crop'
import Slider from '@mui/material/Slider';
import { useDropzone } from 'react-dropzone';
import { CanvasPreview } from './CanvasPreview'
import 'react-image-crop/dist/ReactCrop.css'
import Webcam from "react-webcam";
import Model from './Model';
import Steps from './Steps';
import NJumpTime from './NJumpTime';
import Resize from './Resize';

function centerAspectCrop() {
  let mediaWidth = 64;
  let mediaHeight = 64;
  let aspect = 1 / 1;
  return centerCrop(
    makeAspectCrop(
      {
        unit: 'px',
        width: 64,
      },
      aspect,
      mediaWidth,
      mediaHeight,
    ),
    mediaWidth,
    mediaHeight,
  )
}

function replaceTransparentWithWhite(canvas) {
  // Create a new canvas
  var newCanvas = document.createElement('canvas');
  var newCtx = newCanvas.getContext('2d');

  // Set the dimensions of the new canvas to match the original canvas
  newCanvas.width = canvas.width;
  newCanvas.height = canvas.height;

  // Get the image data from the original canvas
  var imageData = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);

  // Iterate through the pixels in the image data
  for (var i = 0; i < imageData.data.length; i += 4) {
    // If the pixel is transparent (the alpha value is 0), replace it with white (255, 255, 255)
    if (imageData.data[i + 3] === 0) {
      imageData.data[i] = 255;
      imageData.data[i + 1] = 255;
      imageData.data[i + 2] = 255;
      imageData.data[i + 3] = 1;
    }
  }

  // Put the modified image data on the new canvas
  newCtx.putImageData(imageData, 0, 0);

  // Return the new canvas
  return newCanvas;
}


function Input({onOutputUpdate}) {
  const [imgSrc, setImgSrc] = useState('')
  const [files, setFiles] = useState([]);
  const [fileName, setFileName] = useState("")
  const [crop, setCrop] = useState({})
  const [completedCrop, setCompletedCrop] = useState({})
  const [scale, setScale] = useState(1)
  const [rotate, setRotate] = useState(0)
  const [showWebCam, setShowWebCam] = useState(false)
  const [isDrawing, setIsDrawing] = useState(false)
  const [model, setModel] = useState("celeba_hq_256")
  const [steps, setSteps] = useState(200)
  const [nJumpTime, setNJumpTime] = useState(3)
  const [size, setSize] = useState(256)
  const previewCanvasRef = useRef(null)
  const drawCanvasRef = useRef(null);
  const contextRef = useRef(null);
  const imgRef = useRef(null)
  const aspect = 1 / 1
  const videoConstraints = {
    width: 1280,
    height: 720,
    facingMode: "user"
  };

  const webcamRef = useRef(null);
  const capture = useCallback(
    () => {
      const imageSrc = webcamRef.current.getScreenshot();
      setImgSrc(imageSrc);
      setFileName(imageSrc)
    },
    [webcamRef]
  );

  const { getRootProps, getInputProps } = useDropzone({
    accept: {
      'image/*': []
    },
    onDrop: acceptedFiles => {
      setFiles(acceptedFiles.map(file => Object.assign(file, {
        preview: URL.createObjectURL(file)
      })));
    }
  });

  useEffect(() => {
    files.map(file => {
      setFileName(file.path)
      return setImgSrc(file.preview)
    })
    return () => files.forEach(file => URL.revokeObjectURL(file.preview));
  }, [files]);

  const onImageLoad = (e) => {
    if (aspect) {
      const { width, height } = e.currentTarget
      setCrop(centerAspectCrop(width, height, aspect))

    }
  }

  useEffect(() => {
    const t = setTimeout(async () => {
      if (
        completedCrop?.width &&
        completedCrop?.height &&
        imgRef.current &&
        previewCanvasRef.current
      ) {
        CanvasPreview(
          imgRef.current,
          previewCanvasRef.current,
          completedCrop,
          scale,
          rotate,
        )
      }
    }, 100)
    return () => {
      clearTimeout(t)
    }
  }, [completedCrop, scale, rotate, previewCanvasRef])

  // const download = () => {
  //   var link = document.createElement('a');
  //   link.download = 'filename.png';
  //   link.href = document.getElementById('canvas').toDataURL()
  //   link.click();

  const handleRemoveFile = () => {
    setImgSrc("")
    setFileName("")
    setFiles([])
    const canvas = previewCanvasRef.current
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  useEffect(() => {
    const canvas = drawCanvasRef.current
    canvas.width = size;
    canvas.height = size;

    const context = canvas.getContext("2d")
    context.scale(1, 1);
    context.lineCap = "round";
    context.strokeStyle = "black";
    context.lineWidth = 5;
    contextRef.current = context;
  }, [size]);

  const startDrawing = ({ nativeEvent }) => {
    const { offsetX, offsetY } = nativeEvent;
    contextRef.current.beginPath();
    contextRef.current.moveTo(offsetX, offsetY);
    setIsDrawing(true);
  };

  const finishDrawing = () => {
    contextRef.current.closePath();
    setIsDrawing(false);
  };

  const draw = ({ nativeEvent }) => {
    if (!isDrawing) {
      return;
    }
    const { offsetX, offsetY } = nativeEvent;
    contextRef.current.lineTo(offsetX, offsetY);
    contextRef.current.stroke();
  };

  const handleSubmit = () => {
    const data = {
      input : {
        image: previewCanvasRef.current.toDataURL(),
        mask: replaceTransparentWithWhite(drawCanvasRef.current).toDataURL(),
        model: model,
        steps: steps.toString(),
        jump_n_sample: nJumpTime.toString()
     }
    }
    console.log(data);

    fetch('/predictions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    })
    .then(response => response.json())
    .then(response => {
      console.log(response)
      onOutputUpdate(response.output)
    })
  }

  return (
    <div>
      <div className="crop-controls">
        {!!imgSrc &&
          <>
            <div className='modal-container'>
              {
                <ReactCrop
                  crop={crop}
                  onChange={(_, percentCrop) => setCrop(percentCrop)}
                  onComplete={(c) => setCompletedCrop(c)}
                  aspect={aspect}
                >
                  <img
                    ref={imgRef}
                    alt="Crop me"
                    src={imgSrc}
                    style={{ transform: `scale(${scale}) rotate(${rotate}deg)` }}
                    onLoad={onImageLoad}
                  />
                </ReactCrop>}
            </div>
            <div>
              <label className='edit-label label'>edit</label>
              <div className='modal'>
                <div className='settings-image'>
                  <div className='zoom-container'>
                    <span className='icon' onClick={() => setScale((current) => current - 0.1)}><i className="fa-sharp fa-solid fa-magnifying-glass-minus"></i></span>
                    <Slider
                      aria-label="Default"
                      valueLabelDisplay="auto"
                      min={0}
                      max={200}
                      value={typeof scale === 'number' ? Math.round(scale * 100) : 0}
                      onChange={(e, newValue) => setScale(newValue / 100)}
                    />
                    <span className='icon' onClick={() => setScale((current) => current + 0.1)}><i className="fa-sharp fa-solid fa-magnifying-glass-plus"></i></span>
                  </div>
                  <div className='rotate-container'>
                    <div className='rotate-btn' onClick={() => setRotate(current => current - 90)}>
                      <button>Rotale left</button>
                      <span><i className="fa-sharp fa-solid fa-rotate-left"></i></span>
                    </div>
                    <div className='rotate-btn' onClick={() => setRotate(current => current + 90)}>
                      <span><i className="fa-sharp fa-solid fa-rotate-right"></i></span>
                      <button>Rotale right</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </>
        }
        <label className='label-dropzone label'>image</label>
        <div className='drop-file'>
          <div className='dropzone-container'>
            <div {...getRootProps()} className="dropzone">
              <input {...getInputProps()} />
              <span><i className="fa-sharp fa-solid fa-upload"></i></span>
              <p>Drop a file or click to select</p>
              <p>{ }</p>
            </div>
            {!!fileName && <div className='filename-container'>
              <p>{fileName}</p>
              <i className="fa-solid fa-trash" onClick={handleRemoveFile}></i>
            </div>}
          </div>
        </div>
        {showWebCam && (
          <>
            {!imgSrc && (
              <>
                <Webcam
                  audio={false}
                  height={360}
                  ref={webcamRef}
                  screenshotFormat="image/jpeg"
                  width={720}
                  videoConstraints={videoConstraints}
                />
                <div className='webcam-button'>
                  <button onClick={capture} className="take-photo">Take photo</button>
                  <button onClick={() => setShowWebCam(false)} className="cancel">Cancel</button>
                </div>
              </>
            )}
          </>
        )}
        <div className="webcam" onClick={() => setShowWebCam(true)}>
          <span><i className="fa-solid fa-camera"></i></span>
          <button>
            Take a photo with webcam
          </button>
        </div>
      </div>
      <Model setModel={(value) => setModel(value)}></Model>
      {!!completedCrop && (
        <div className='draw-mask'>
          <label className='label-mask label'>mask</label>
          <div style={{ position: "relative" }}>
            <canvas
              id='canvas'
              ref={previewCanvasRef}
              style={{
                border: '1px solid black',
                objectFit: 'contain',
                width: size,
                height: size,
                position: 'relative'
              }}
            ></canvas>
            <canvas
              onMouseDown={startDrawing}
              onMouseUp={finishDrawing}
              onMouseMove={draw}
              ref={drawCanvasRef}
              style={{ position: "absolute", top: "0" }}
            ></canvas>
          </div>
        </div>
      )}
      {/* <Resize setSize={(value) => { setSize(value) }}></Resize> */}
      <Steps value={steps} setValue={(value) => setSteps(value)}></Steps>
      <NJumpTime value={nJumpTime} setValue={(value) => setNJumpTime(value)}></NJumpTime>
      <button className='submit-button' onClick={handleSubmit}>Submit</button>
    </div >
  )
}

export default Input