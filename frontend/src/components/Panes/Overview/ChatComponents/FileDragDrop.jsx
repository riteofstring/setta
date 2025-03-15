import { useEffect, useRef, useState } from "react";
import { HiOutlinePhotograph, HiX } from "react-icons/hi";

export function FileDragDrop({ onFileSelect, acceptedTypes = "image/*" }) {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [previewUrls, setPreviewUrls] = useState([]);
  const fileInputRef = useRef(null);

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = [...e.dataTransfer.files];
    if (files.length > 0) {
      handleFiles(files);
    }
  };

  const handleFileSelect = (e) => {
    const files = [...e.target.files];
    if (files.length > 0) {
      handleFiles(files);
    }
  };

  const handleFiles = (files) => {
    // Filter for accepted file types
    const filteredFiles = files.filter((file) => {
      if (acceptedTypes === "*") return true;

      // For images, check MIME type starts with "image/"
      if (acceptedTypes === "image/*" && file.type.startsWith("image/")) {
        return true;
      }

      // For specific types, check against the list
      if (acceptedTypes.includes(file.type)) {
        return true;
      }

      return false;
    });

    if (filteredFiles.length === 0) return;

    // Create preview URLs for images and attach them to file objects for tracking
    const enhancedFiles = filteredFiles.map((file) => {
      // Create a copy of the file object with an objectURL property if it's an image
      const enhancedFile = Object.assign({}, file);

      if (file.type.startsWith("image/")) {
        enhancedFile.objectURL = URL.createObjectURL(file);
      }

      return enhancedFile;
    });

    // Update local state
    const newFiles = [...selectedFiles, ...enhancedFiles];
    setSelectedFiles(newFiles);

    // Create preview URLs array from the enhanced files
    const newPreviewUrls = newFiles.map((file) => file.objectURL || null);
    setPreviewUrls(newPreviewUrls);

    // Notify parent component
    if (onFileSelect) {
      onFileSelect(newFiles);
    }
  };

  const removeFile = (index) => {
    // Clean up object URL to prevent memory leaks
    if (selectedFiles[index].objectURL) {
      URL.revokeObjectURL(selectedFiles[index].objectURL);
    }

    const newFiles = [...selectedFiles];
    newFiles.splice(index, 1);
    setSelectedFiles(newFiles);

    // Update preview URLs based on the files
    const newPreviewUrls = newFiles.map((file) => file.objectURL || null);
    setPreviewUrls(newPreviewUrls);

    // Notify parent component
    if (onFileSelect) {
      onFileSelect(newFiles);
    }
  };

  // Clean up all object URLs when component unmounts
  useEffect(() => {
    return () => {
      selectedFiles.forEach((file) => {
        if (file.objectURL) {
          URL.revokeObjectURL(file.objectURL);
        }
      });
    };
  }, []);

  const handleButtonClick = () => {
    fileInputRef.current.click();
  };

  return (
    <div className="mb-2">
      {/* Hidden file input */}
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        multiple
        accept={acceptedTypes}
        onChange={handleFileSelect}
      />

      {/* Drag and drop area - only show if no files are selected */}
      {selectedFiles.length === 0 && (
        <div
          className={`flex cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed p-6 transition-colors ${
            isDragging
              ? "border-blue-500 bg-blue-50 dark:border-blue-600 dark:bg-blue-900/20"
              : "border-setta-200 bg-setta-50 hover:border-blue-400 hover:bg-setta-100/60 dark:border-setta-700 dark:bg-setta-800/30 dark:hover:border-blue-700"
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={handleButtonClick}
        >
          <HiOutlinePhotograph
            className="mb-2 text-setta-400 dark:text-setta-500"
            size={24}
          />
          <p className="mb-1 text-sm font-medium text-setta-600 dark:text-setta-300">
            Drag and drop files here
          </p>
          <p className="text-xs text-setta-500 dark:text-setta-400">
            or click to select
          </p>
        </div>
      )}

      {/* Preview selected files */}
      {selectedFiles.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {selectedFiles.map((file, index) => (
            <div
              key={index}
              className="relative rounded-md border border-setta-200 dark:border-setta-700"
            >
              {file.objectURL ? (
                <div className="group relative">
                  <img
                    src={file.objectURL}
                    alt={file.name}
                    className="h-24 w-24 rounded-md object-cover"
                  />
                  <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-40 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFile(index);
                      }}
                      className="rounded-full bg-red-500 p-1 text-white hover:bg-red-600"
                    >
                      <HiX size={14} />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex h-24 w-24 flex-col items-center justify-center p-2 text-center">
                  <span className="mb-1 max-w-full truncate text-xs font-medium">
                    {file.name}
                  </span>
                  <span className="text-xs text-setta-500">
                    {(file.size / 1024).toFixed(0)} KB
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeFile(index);
                    }}
                    className="mt-1 rounded-full bg-red-500 p-1 text-white hover:bg-red-600"
                  >
                    <HiX size={10} />
                  </button>
                </div>
              )}
            </div>
          ))}

          {/* Add more button */}
          <button
            onClick={handleButtonClick}
            className="flex h-24 w-24 flex-col items-center justify-center rounded-md border-2 border-dashed border-setta-200 bg-setta-50 hover:border-blue-400 hover:bg-setta-100/60 dark:border-setta-700 dark:bg-setta-800/30 dark:hover:border-blue-700"
          >
            <span className="text-xl text-setta-400">+</span>
            <span className="text-xs text-setta-500">Add more</span>
          </button>
        </div>
      )}
    </div>
  );
}
