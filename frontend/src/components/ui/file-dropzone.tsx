"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

interface FileDropzoneProps {
  onFileSelect: (file: File) => void
  accept?: string
  maxSize?: number
  label?: string
  className?: string
}

function FileDropzone({
  onFileSelect,
  accept,
  maxSize,
  label = "Drag and drop a file here, or click to browse",
  className,
}: FileDropzoneProps) {
  const [isDragging, setIsDragging] = React.useState(false)
  const [selectedFile, setSelectedFile] = React.useState<File | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)

  function validateFile(file: File): boolean {
    setError(null)

    if (accept) {
      const acceptedTypes = accept.split(",").map((t) => t.trim())
      const fileExt = `.${file.name.split(".").pop()?.toLowerCase()}`
      const matches = acceptedTypes.some(
        (type) =>
          type === file.type ||
          type === fileExt ||
          (type.endsWith("/*") && file.type.startsWith(type.replace("/*", "/")))
      )
      if (!matches) {
        setError(`File type not accepted. Expected: ${accept}`)
        return false
      }
    }

    if (maxSize && file.size > maxSize) {
      const maxMB = (maxSize / (1024 * 1024)).toFixed(1)
      setError(`File too large. Maximum size: ${maxMB} MB`)
      return false
    }

    return true
  }

  function handleFile(file: File) {
    if (validateFile(file)) {
      setSelectedFile(file)
      onFileSelect(file)
    }
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    const file = e.dataTransfer.files[0]
    if (file) {
      handleFile(file)
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) {
      handleFile(file)
    }
  }

  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <div
      data-slot="file-dropzone"
      className={cn(
        "relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 text-center transition-colors",
        isDragging
          ? "border-primary bg-primary/5 text-primary"
          : "border-muted-foreground/25 text-muted-foreground hover:border-muted-foreground/50",
        "cursor-pointer",
        className
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          inputRef.current?.click()
        }
      }}
    >
      <input
        ref={inputRef}
        type="file"
        className="sr-only"
        accept={accept}
        onChange={handleInputChange}
      />
      {!selectedFile ? (
        <>
          <svg
            className="mb-2 h-8 w-8"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z"
            />
          </svg>
          <p className="text-sm">{label}</p>
          {accept && (
            <p className="mt-1 text-xs text-muted-foreground/70">
              Accepted: {accept}
            </p>
          )}
        </>
      ) : (
        <div className="flex items-center gap-3">
          <svg
            className="h-6 w-6 shrink-0 text-primary"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
            />
          </svg>
          <div className="flex flex-col items-start gap-0.5">
            <span className="text-sm font-medium text-foreground truncate max-w-[200px]">
              {selectedFile.name}
            </span>
            <span className="text-xs text-muted-foreground">
              {formatFileSize(selectedFile.size)}
            </span>
          </div>
        </div>
      )}
      {error && (
        <p className="mt-2 text-xs text-destructive">{error}</p>
      )}
    </div>
  )
}

export { FileDropzone }
export type { FileDropzoneProps }
