document.addEventListener('DOMContentLoaded', () => {
  // --- DOM Elements ---
  const imageInput1 = document.getElementById('imageInput1');
  const imageInput2 = document.getElementById('imageInput2');
  const preview1 = document.getElementById('preview1');
  const preview2 = document.getElementById('preview2');
  const aspectRatioSelect = document.getElementById('aspectRatioSelect');
  const position1Select = document.getElementById('position1');
  const position2Select = document.getElementById('position2');
  const pos1Group = document.getElementById('pos1-group');
  const pos2Group = document.getElementById('pos2-group');
  const processButton = document.getElementById('processButton');
  const resultsContainer = document.getElementById('resultsContainer');
  // downloadAllButton removed
  const statusMessage = document.getElementById('statusMessage');
  const processingCanvas = document.getElementById('processingCanvas');
  const procCtx = processingCanvas.getContext('2d');

  // generatedResults array removed (no longer needed for zipping)

  // --- Helper Functions --- (parseAspectRatio, sanitizeFilename, generateOutputFilename, loadImage, displayPreview, cropImage, getSelectedAspectRatios - remain the same)

  function parseAspectRatio(arStr) {
    try {
      const parts = arStr.split(':');
      if (parts.length !== 2) throw new Error();
      const w = parseInt(parts[0], 10);
      const h = parseInt(parts[1], 10);
      if (isNaN(w) || isNaN(h) || w <= 0 || h <= 0) throw new Error();
      return { w, h, ratio: w / h };
    } catch (e) {
      throw new Error(`Invalid aspect ratio string: ${arStr}`);
    }
  }

  function sanitizeFilename(name) {
    let baseName = name.substring(name.lastIndexOf('/') + 1).substring(name.lastIndexOf('\\') + 1);
    let ext = '';
    const dotIndex = baseName.lastIndexOf('.');
    if (dotIndex > 0) {
      ext = baseName.substring(dotIndex);
      baseName = baseName.substring(0, dotIndex);
    }
    baseName = baseName.replace(/[\s:\\\/]/g, '_').replace(/_{2,}/g, '_');
    return baseName + ext;
  }

  function generateOutputFilename(file1Name, file2Name, arString) {
    const safeFile1 = sanitizeFilename(file1Name).replace(/\.[^/.]+$/, "");
    const arSanitized = arString.replace(':', 'x');
    let filename = `ImageStack_${safeFile1}`;
    if (file2Name) {
      const safeFile2 = sanitizeFilename(file2Name).replace(/\.[^/.]+$/, "");
      filename += `_${safeFile2}`;
    }
    filename += `_${arSanitized}.jpg`;
    return filename;
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
        img.onerror = (err) => reject(new Error(`Failed to load image ${file.name}: ${err}`));
        img.src = e.target.result;
      };
      reader.onerror = (err) => reject(new Error(`Failed to read file ${file.name}: ${err}`));
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
      sWidth = imgHeight * targetRatio;
      switch (position) {
        case 'left': sx = 0; break;
        case 'right': sx = imgWidth - sWidth; break;
        case 'center': default: sx = (imgWidth - sWidth) / 2; break;
        case 'top': sx = (imgWidth - sWidth) / 2; break;
        case 'bottom': sx = (imgWidth - sWidth) / 2; break;
      }
    } else if (currentRatio < targetRatio) {
      sHeight = imgWidth / targetRatio;
       switch (position) {
        case 'top': sy = 0; break;
        case 'bottom': sy = imgHeight - sHeight; break;
        case 'center': default: sy = (imgHeight - sHeight) / 2; break;
        case 'left': sy = (imgHeight - sHeight) / 2; break;
        case 'right': sy = (imgHeight - sHeight) / 2; break;
      }
    }

    processingCanvas.width = Math.round(sWidth);
    processingCanvas.height = Math.round(sHeight);
    procCtx.clearRect(0, 0, processingCanvas.width, processingCanvas.height);

    procCtx.drawImage(
      img,
      Math.round(sx), Math.round(sy), Math.round(sWidth), Math.round(sHeight),
      0, 0, processingCanvas.width, processingCanvas.height
    );
    return processingCanvas;
  }

  function getSelectedAspectRatios() {
    const selectedOptions = Array.from(aspectRatioSelect.selectedOptions);
    if (selectedOptions.length === 0) {
        throw new Error("Please select at least one aspect ratio.");
    }
    return selectedOptions.map(option => option.value);
  }

  // --- Event Listeners ---

  imageInput1.addEventListener('change', () => displayPreview(imageInput1, preview1));
  imageInput2.addEventListener('change', () => {
    displayPreview(imageInput2, preview2);
    pos2Group.style.display = imageInput2.files.length > 0 ? 'block' : 'none';
    pos1Group.querySelector('label').textContent = imageInput2.files.length > 0
      ? 'Image 1 Crop Position:'
      : 'Crop Position:';
  });

  // Main Processing Logic
  processButton.addEventListener('click', async () => {
    statusMessage.textContent = 'Starting processing...';
    resultsContainer.innerHTML = ''; // Clear previous results
    let generatedCount = 0; // Count generated images

    const file1 = imageInput1.files[0];
    const file2 = imageInput2.files[0];
    const pos1 = position1Select.value;
    const pos2 = position2Select.value;

    if (!file1) {
      statusMessage.textContent = 'Error: Please select at least Image 1.';
      return;
    }

    let selectedAspectRatios;
    try {
      selectedAspectRatios = getSelectedAspectRatios();
    } catch (e) {
      statusMessage.textContent = `Error: ${e.message}`;
      return;
    }

    try {
      statusMessage.textContent = `Loading Image 1...`;
      const img1 = await loadImage(file1);
      let img2 = null;
      if (file2) {
        statusMessage.textContent = `Loading Image 2...`;
        img2 = await loadImage(file2);
      }

      // Process each selected aspect ratio
      for (const arString of selectedAspectRatios) {
        statusMessage.textContent = `Processing ratio ${arString}...`;
        const aspectRatio = parseAspectRatio(arString);
        const filename = generateOutputFilename(file1.name, file2?.name, arString);

        let finalCanvas = document.createElement('canvas');
        let finalCtx = finalCanvas.getContext('2d');

        if (!img2) {
          // Single Image Mode
          const croppedCanvas = cropImage(img1, aspectRatio.ratio, pos1);
          finalCanvas.width = croppedCanvas.width;
          finalCanvas.height = croppedCanvas.height;
          finalCtx.drawImage(croppedCanvas, 0, 0);
        } else {
          // Two Image Mode
          const splitRatio = aspectRatio.ratio * 2;

          const croppedCanvas1 = cropImage(img1, splitRatio, pos1);
          const tempCanvas1 = document.createElement('canvas');
          tempCanvas1.width = croppedCanvas1.width;
          tempCanvas1.height = croppedCanvas1.height;
          tempCanvas1.getContext('2d').drawImage(croppedCanvas1, 0, 0);

          const croppedCanvas2 = cropImage(img2, splitRatio, pos2);
          const tempCanvas2 = document.createElement('canvas');
          tempCanvas2.width = croppedCanvas2.width;
          tempCanvas2.height = croppedCanvas2.height;
          tempCanvas2.getContext('2d').drawImage(croppedCanvas2, 0, 0);

          const finalWidth = Math.max(tempCanvas1.width, tempCanvas2.width);
          const finalHeight = Math.round(finalWidth / aspectRatio.ratio);
          const halfHeight = Math.round(finalHeight / 2);

          finalCanvas.width = finalWidth;
          finalCanvas.height = finalHeight;

          finalCtx.drawImage(tempCanvas1, 0, 0, finalWidth, halfHeight);
          finalCtx.drawImage(tempCanvas2, 0, halfHeight, finalWidth, finalHeight - halfHeight);
        }

        // Get data URL (JPEG format)
        const dataURL = finalCanvas.toDataURL('image/jpeg', 0.95);
        generatedCount++; // Increment count

        // Display result preview and individual download link
        const resultDiv = document.createElement('div');
        resultDiv.className = 'result-item';
        // Ensure the <a> tag has the necessary attributes for direct download
        resultDiv.innerHTML = `
          <h4>${filename}</h4>
          <img src="${dataURL}" alt="${filename}" class="result-preview-img">
          <a href="${dataURL}" download="${filename}">Download ${arString}</a>
        `;
        resultsContainer.appendChild(resultDiv);

      } // End loop through aspect ratios

      statusMessage.textContent = `Processing complete. ${generatedCount} image(s) generated. Click links to download individually.`;

    } catch (error) {
      console.error("Processing error:", error);
      statusMessage.textContent = `Error: ${error.message}`;
    }
  });

  // Download All button listener removed

  // --- Initial Setup ---
  pos2Group.style.display = 'none';
});