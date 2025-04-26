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
  const clearInputsButton = document.getElementById('clearInputsButton'); // Get the new button
  const resultsContainer = document.getElementById('resultsContainer');
  const downloadAllSequentiallyButton = document.getElementById('downloadAllSequentiallyButton');
  const statusMessage = document.getElementById('statusMessage');
  const processingCanvas = document.getElementById('processingCanvas');
  const procCtx = processingCanvas.getContext('2d');

  let generatedResultsData = [];

  // --- Helper Functions --- (Remain the same)
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
    // Update UI based on second image presence
    const hasSecondImage = imageInput2.files.length > 0;
    pos2Group.style.display = hasSecondImage ? 'block' : 'none';
    pos1Group.querySelector('label').textContent = hasSecondImage
      ? 'Image 1 Crop Position:'
      : 'Crop Position:';
  });

  // Listener for the new Clear Inputs Button
  clearInputsButton.addEventListener('click', () => {
    // Clear file input values
    imageInput1.value = null;
    imageInput2.value = null;

    // Hide previews
    preview1.src = '#';
    preview1.style.display = 'none';
    preview2.src = '#';
    preview2.style.display = 'none';

    // Reset related UI elements
    pos2Group.style.display = 'none';
    pos1Group.querySelector('label').textContent = 'Crop Position:';

    // Clear results and status
    resultsContainer.innerHTML = '';
    statusMessage.textContent = '';
    generatedResultsData = []; // Clear stored results data
    downloadAllSequentiallyButton.style.display = 'none'; // Hide download all button

    console.log('Inputs and results cleared.');
  });

  // Process Button Listener (remains the same)
  processButton.addEventListener('click', async () => {
    statusMessage.textContent = 'Starting processing...';
    resultsContainer.innerHTML = '';
    downloadAllSequentiallyButton.style.display = 'none';
    generatedResultsData = [];

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

      for (const arString of selectedAspectRatios) {
        // ... (image processing logic remains the same) ...
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

        const dataURL = finalCanvas.toDataURL('image/jpeg', 0.95);
        generatedResultsData.push({ filename: filename, dataURL: dataURL });

        const resultDiv = document.createElement('div');
        resultDiv.className = 'result-item';
        resultDiv.innerHTML = `
          <h4>${filename}</h4>
          <img src="${dataURL}" alt="${filename}" class="result-preview-img">
          <a href="${dataURL}" download="${filename}">Download ${arString}</a>
        `;
        resultsContainer.appendChild(resultDiv);
      }

      statusMessage.textContent = `Processing complete. ${generatedResultsData.length} image(s) generated. Click links or 'Download All' button.`;
      if (generatedResultsData.length > 0) {
        downloadAllSequentiallyButton.style.display = 'block';
      }

    } catch (error) {
      console.error("Processing error:", error);
      statusMessage.textContent = `Error: ${error.message}`;
      downloadAllSequentiallyButton.style.display = 'none';
    }
  });

  // Sequential Download Button Listener (remains the same)
  downloadAllSequentiallyButton.addEventListener('click', () => {
    if (generatedResultsData.length === 0) {
      statusMessage.textContent = "No results available to download.";
      return;
    }

    statusMessage.textContent = `Attempting to download ${generatedResultsData.length} files sequentially... (Browser may block this)`;
    downloadAllSequentiallyButton.disabled = true;

    let currentFileIndex = 0;
    const delayBetweenDownloads = 300;

    function triggerDownload(index) {
      if (index >= generatedResultsData.length) {
        statusMessage.textContent = `Finished attempting downloads. Check your browser's download list/bar. Some files may have been blocked.`;
        downloadAllSequentiallyButton.disabled = false;
        return;
      }

      const result = generatedResultsData[index];
      try {
        const link = document.createElement('a');
        link.href = result.dataURL;
        link.download = result.filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        statusMessage.textContent = `Triggered download for: ${result.filename} (${index + 1}/${generatedResultsData.length})`;
      } catch (err) {
          console.error(`Error triggering download for ${result.filename}:`, err);
          statusMessage.textContent = `Error triggering download for ${result.filename}. Browser might be blocking downloads.`;
      }

      setTimeout(() => {
        triggerDownload(index + 1);
      }, delayBetweenDownloads);
    }
    triggerDownload(0);
  });

  // --- Initial Setup ---
  pos2Group.style.display = 'none';
});