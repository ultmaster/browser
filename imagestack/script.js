document.addEventListener('DOMContentLoaded', () => {
  // Get DOM Elements
  const imageInput1 = document.getElementById('imageInput1');
  const imageInput2 = document.getElementById('imageInput2');
  const preview1 = document.getElementById('preview1');
  const preview2 = document.getElementById('preview2');
  const aspectRatioInput = document.getElementById('aspectRatioInput');
  const position1Select = document.getElementById('position1');
  const position2Select = document.getElementById('position2');
  const pos1Group = document.getElementById('pos1-group');
  const pos2Group = document.getElementById('pos2-group');
  const processButton = document.getElementById('processButton');
  const outputCanvas = document.getElementById('outputCanvas');
  const downloadLink = document.getElementById('downloadLink');
  const statusMessage = document.getElementById('statusMessage');
  const ctx = outputCanvas.getContext('2d');

  // --- Helper Functions ---

  function parseAspectRatio(arStr) {
    try {
      const parts = arStr.split(':');
      if (parts.length !== 2) throw new Error();
      const w = parseInt(parts[0], 10);
      const h = parseInt(parts[1], 10);
      if (isNaN(w) || isNaN(h) || w <= 0 || h <= 0) throw new Error();
      return { w, h, ratio: w / h };
    } catch (e) {
      throw new Error("Aspect ratio must be in format 'width:height' (e.g., '5:7') with positive integer values.");
    }
  }

  function loadImage(file) {
    return new Promise((resolve, reject) => {
      if (!file) {
        reject(new Error("No file provided."));
        return;
      }
      if (!file.type.startsWith('image/')) {
         reject(new Error(`File ${file.name} is not a recognized image type.`));
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = (err) => reject(new Error(`Failed to load image: ${err}`));
        img.src = e.target.result;
      };
      reader.onerror = (err) => reject(new Error(`Failed to read file: ${err}`));
      reader.readAsDataURL(file);
    });
  }

  function displayPreview(fileInput, previewElement) {
     const file = fileInput.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = function(e) {
        previewElement.src = e.target.result;
        previewElement.style.display = 'block';
      }
      reader.readAsDataURL(file);
    } else {
      previewElement.src = '#';
      previewElement.style.display = 'none';
    }
  }

  function cropImage(img, targetRatio, position) {
    const imgWidth = img.naturalWidth;
    const imgHeight = img.naturalHeight;
    const currentRatio = imgWidth / imgHeight;

    let sx = 0, sy = 0, sWidth = imgWidth, sHeight = imgHeight;

    if (currentRatio > targetRatio) {
      // Image is wider than target aspect ratio, crop width
      sWidth = imgHeight * targetRatio;
      switch (position) {
        case 'left': sx = 0; break;
        case 'right': sx = imgWidth - sWidth; break;
        case 'center':
        default: sx = (imgWidth - sWidth) / 2; break;
        // For targetRatio > 1 (landscape), top/bottom behave like center
        case 'top': sx = (imgWidth - sWidth) / 2; break;
        case 'bottom': sx = (imgWidth - sWidth) / 2; break;
      }
    } else if (currentRatio < targetRatio) {
      // Image is taller than target aspect ratio, crop height
      sHeight = imgWidth / targetRatio;
       switch (position) {
        case 'top': sy = 0; break;
        case 'bottom': sy = imgHeight - sHeight; break;
        case 'center':
        default: sy = (imgHeight - sHeight) / 2; break;
         // For targetRatio < 1 (portrait), left/right behave like center
        case 'left': sy = (imgHeight - sHeight) / 2; break;
        case 'right': sy = (imgHeight - sHeight) / 2; break;
      }
    }
    // else: aspect ratio matches, no crop needed in terms of source rectangle

    // Create a temporary canvas to hold the cropped image data
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = Math.round(sWidth); // Use cropped dimensions for the canvas
    tempCanvas.height = Math.round(sHeight);
    const tempCtx = tempCanvas.getContext('2d');

    tempCtx.drawImage(
      img,
      Math.round(sx), Math.round(sy), Math.round(sWidth), Math.round(sHeight), // Source rect
      0, 0, Math.round(sWidth), Math.round(sHeight)           // Destination rect (fill the temp canvas)
    );

    return tempCanvas; // Return the canvas element containing the cropped image
  }

  // --- Event Listeners ---

  imageInput1.addEventListener('change', () => displayPreview(imageInput1, preview1));
  imageInput2.addEventListener('change', () => {
    displayPreview(imageInput2, preview2);
    // Show/hide second position selector based on file presence
    pos2Group.style.display = imageInput2.files.length > 0 ? 'block' : 'none';
    pos1Group.querySelector('label').textContent = imageInput2.files.length > 0
      ? 'Image 1 Crop Position:'
      : 'Crop Position:';
  });

  processButton.addEventListener('click', async () => {
    statusMessage.textContent = 'Processing...';
    downloadLink.style.display = 'none';
    ctx.clearRect(0, 0, outputCanvas.width, outputCanvas.height); // Clear previous result

    const file1 = imageInput1.files[0];
    const file2 = imageInput2.files[0];
    const pos1 = position1Select.value;
    const pos2 = position2Select.value;

    if (!file1) {
      statusMessage.textContent = 'Error: Please select at least Image 1.';
      return;
    }

    let aspectRatio;
    try {
      aspectRatio = parseAspectRatio(aspectRatioInput.value);
    } catch (e) {
      statusMessage.textContent = `Error: ${e.message}`;
      return;
    }

    try {
      const img1 = await loadImage(file1);

      if (!file2) {
        // --- Single Image Mode ---
        const croppedCanvas = cropImage(img1, aspectRatio.ratio, pos1);

        // Set final canvas size and draw the cropped image
        outputCanvas.width = croppedCanvas.width;
        outputCanvas.height = croppedCanvas.height;
        ctx.drawImage(croppedCanvas, 0, 0);

        statusMessage.textContent = 'Processing complete.';
        setupDownloadLink('output_image.jpg');

      } else {
        // --- Two Image Mode ---
        const img2 = await loadImage(file2);

        // Target aspect ratio for *each half* when stacked vertically
        // If final is W:H, each half needs to be W : (H/2), so ratio is W / (H/2) = 2 * (W/H)
        const splitRatio = aspectRatio.ratio * 2;

        const croppedCanvas1 = cropImage(img1, splitRatio, pos1);
        const croppedCanvas2 = cropImage(img2, splitRatio, pos2);

        // Determine final canvas size based on the target *final* aspect ratio
        // Use the widest of the two cropped images as the base width
        const finalWidth = Math.max(croppedCanvas1.width, croppedCanvas2.width);
        // Calculate final height based on the target aspect ratio
        const finalHeight = Math.round(finalWidth / aspectRatio.ratio);
        const halfHeight = Math.round(finalHeight / 2);

        // Adjust canvas size
        outputCanvas.width = finalWidth;
        outputCanvas.height = finalHeight;

        // Draw the first cropped image (resized to fit top half)
        ctx.drawImage(croppedCanvas1, 0, 0, finalWidth, halfHeight);

        // Draw the second cropped image (resized to fit bottom half)
        ctx.drawImage(croppedCanvas2, 0, halfHeight, finalWidth, finalHeight - halfHeight); // Use remaining height

        statusMessage.textContent = 'Processing complete.';
        setupDownloadLink('output_combined.jpg');
      }
    } catch (error) {
      console.error("Processing error:", error);
      statusMessage.textContent = `Error: ${error.message}`;
    }
  });

  function setupDownloadLink(filename) {
    try {
      // Determine format based on filename or default to JPEG
      const format = filename.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
      const quality = format === 'image/jpeg' ? 0.95 : undefined; // Quality only for JPEG

      const dataURL = outputCanvas.toDataURL(format, quality);
      downloadLink.href = dataURL;
      downloadLink.download = filename;
      downloadLink.style.display = 'block';
      outputCanvas.style.border = '1px solid #ccc'; // Make canvas visible
    } catch (e) {
      console.error("Error generating download link:", e);
      statusMessage.textContent = 'Error: Could not generate image data URL. Canvas might be too large or tainted.';
       outputCanvas.style.border = '1px solid red';
    }
  }

  // Initial setup
  pos2Group.style.display = 'none'; // Hide pos2 initially
   outputCanvas.style.border = 'none'; // Hide border initially
});