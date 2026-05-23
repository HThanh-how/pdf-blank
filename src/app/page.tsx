"use client";

import React, { useState, useRef, useEffect } from "react";
import { 
  FileUp, 
  FileText, 
  Settings, 
  Layers, 
  Download, 
  RefreshCw, 
  AlertCircle, 
  Check,
  ChevronRight,
  Trash2,
  FolderArchive,
  FileDown,
  X,
  HelpCircle
} from "lucide-react";
import { PdfBlankPageInserter } from "@/utils/pdfProcessor";
import { PDFDocument } from "pdf-lib";
import JSZip from "jszip";

interface FileItem {
  file: File;
  pageCount: number;
  loading: boolean;
  error: string | null;
}

interface ProcessedResultItem {
  id: string;
  fileName: string;
  originalPageCount: number;
  newPageCount: number;
  insertedCount: number;
  downloadUrl: string;
}

export default function Home() {
  // --- States ---
  const [files, setFiles] = useState<FileItem[]>([]);
  const [dragActive, setDragActive] = useState<boolean>(false);
  
  // Settings States
  // Chế độ: 'vnedu' (in 2 mặt thông minh), 'interval' (sau mỗi N trang), 'specific' (chọn trang cụ thể)
  const [mode, setMode] = useState<"vnedu" | "interval" | "specific">("vnedu");
  const [intervalValue, setIntervalValue] = useState<number>(3);
  const [specificPagesInput, setSpecificPagesInput] = useState<string>("3, 5");
  const [pageSizeMode, setPageSizeMode] = useState<"same-as-previous" | "a4" | "letter">("same-as-previous");
  const [insertAtEndIfRemainder, setInsertAtEndIfRemainder] = useState<boolean>(true);
  
  // Processing States
  const [processing, setProcessing] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [processingStatus, setProcessingStatus] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  // Result States
  const [processedResults, setProcessedResults] = useState<ProcessedResultItem[]>([]);
  const [zipDownloadUrl, setZipDownloadUrl] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Dọn dẹp các Blob URL tránh rò rỉ bộ nhớ
  useEffect(() => {
    return () => {
      if (zipDownloadUrl) {
        URL.revokeObjectURL(zipDownloadUrl);
      }
      processedResults.forEach((r) => {
        if (r.downloadUrl) {
          URL.revokeObjectURL(r.downloadUrl);
        }
      });
    };
  }, [zipDownloadUrl, processedResults]);

  // --- Handlers ---
  
  // Xử lý kéo thả file
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      validateAndAddFiles(e.dataTransfer.files);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      validateAndAddFiles(e.target.files);
    }
  };

  // Xác minh định dạng PDF, đọc số trang tức thì và gộp vào hàng đợi
  const validateAndAddFiles = async (selectedFiles: FileList | File[]) => {
    setErrorMsg(null);
    setProcessedResults([]);
    if (zipDownloadUrl) {
      URL.revokeObjectURL(zipDownloadUrl);
      setZipDownloadUrl(null);
    }

    const pdfList: File[] = [];
    const invalidFiles: string[] = [];

    Array.from(selectedFiles).forEach((f) => {
      if (f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf")) {
        pdfList.push(f);
      } else {
        invalidFiles.push(f.name);
      }
    });

    if (invalidFiles.length > 0) {
      setErrorMsg(`Bỏ qua ${invalidFiles.length} file không hợp lệ (chỉ hỗ trợ file PDF): ${invalidFiles.join(", ")}`);
    }

    if (pdfList.length === 0) return;

    // Tạo các item ở trạng thái loading trước
    const newItems: FileItem[] = pdfList.map((f) => ({
      file: f,
      pageCount: 0,
      loading: true,
      error: null
    }));

    // Cập nhật hàng đợi hiển thị spinner
    setFiles((prev) => [...prev, ...newItems]);

    // Bất đồng bộ load từng file để trích xuất số trang tức thì
    for (const item of newItems) {
      try {
        const buffer = await item.file.arrayBuffer();
        const doc = await PDFDocument.load(buffer);
        const pages = doc.getPageCount();

        setFiles((prev) => 
          prev.map((f) => 
            f.file === item.file 
              ? { ...f, pageCount: pages, loading: false } 
              : f
          )
        );
      } catch (err: any) {
        const errMsg = err?.message || "";
        const isEncrypted = errMsg.toLowerCase().includes("encrypted") || 
                            errMsg.toLowerCase().includes("password") || 
                            errMsg.toLowerCase().includes("decrypt");
        
        const friendlyError = isEncrypted
          ? "File bị bảo vệ mật khẩu"
          : "File PDF bị hỏng hoặc lỗi định dạng";

        setFiles((prev) => 
          prev.map((f) => 
            f.file === item.file 
              ? { ...f, error: friendlyError, loading: false } 
              : f
          )
        );
      }
    }
  };

  // Xóa lẻ 1 file khỏi hàng đợi
  const handleRemoveFile = (indexToRemove: number) => {
    setErrorMsg(null);
    setProcessedResults([]);
    if (zipDownloadUrl) {
      URL.revokeObjectURL(zipDownloadUrl);
      setZipDownloadUrl(null);
    }
    setFiles((prev) => prev.filter((_, idx) => idx !== indexToRemove));
  };

  // Xóa toàn bộ file trong hàng đợi
  const handleClearAllFiles = () => {
    setFiles([]);
    setProcessedResults([]);
    setErrorMsg(null);
    if (zipDownloadUrl) {
      URL.revokeObjectURL(zipDownloadUrl);
      setZipDownloadUrl(null);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const onButtonClick = () => {
    fileInputRef.current?.click();
  };

  // --- LẦN LƯỢT XỬ LÝ DANH SÁCH FILE PDF (BATCH PROCESSING) ---
  const handleProcessPdfBatch = async () => {
    // Chỉ xử lý các file không bị lỗi và đã load xong số trang
    const validFiles = files.filter((f) => !f.loading && !f.error);
    if (validFiles.length === 0) return;

    setProcessing(true);
    setProgress(5);
    setProcessingStatus("Khởi động tiến trình xử lý...");
    setErrorMsg(null);
    
    // Dọn dẹp Blob Url cũ
    if (zipDownloadUrl) {
      URL.revokeObjectURL(zipDownloadUrl);
      setZipDownloadUrl(null);
    }
    processedResults.forEach((r) => URL.revokeObjectURL(r.downloadUrl));
    setProcessedResults([]);

    const newResults: ProcessedResultItem[] = [];
    const zip = new JSZip();

    try {
      // Phân tích trang chỉ định nếu dùng chế độ 'specific'
      let specificPages: number[] = [];
      if (mode === "specific") {
        specificPages = specificPagesInput
          .split(",")
          .map((p) => parseInt(p.trim(), 10))
          .filter((p) => !isNaN(p) && p > 0);

        if (specificPages.length === 0) {
          throw new Error("Vui lòng nhập ít nhất một số trang hợp lệ để chèn trang trắng.");
        }
      }

      // Vòng lặp xử lý tuần tự từng file PDF trong danh sách
      for (let idx = 0; idx < validFiles.length; idx++) {
        const fileItem = validFiles[idx];
        const fileNum = idx + 1;

        // Cập nhật trạng thái
        setProcessingStatus(`[File ${fileNum}/${validFiles.length}] Đang xử lý: ${fileItem.file.name}...`);
        
        // Chia đều thanh tiến trình theo số lượng file
        const fileProgressStart = Math.floor((idx / validFiles.length) * 80) + 5;
        setProgress(fileProgressStart);

        // Chuyển file thành ArrayBuffer
        const arrayBuffer = await fileItem.file.arrayBuffer();

        // Chạy bất đồng bộ một chút để UI kịp render trạng thái
        await new Promise((resolve) => setTimeout(resolve, 150));

        let res;

        // Nếu ở chế độ vnEdu học bạ thông minh
        if (mode === "vnedu") {
          const studentPageSize = intervalValue;
          const isOdd = studentPageSize % 2 !== 0;

          if (isOdd) {
            // Nếu số trang mỗi em là LẺ, tự động chèn trang trắng sau mỗi N trang
            res = await PdfBlankPageInserter.insertBlankPages(arrayBuffer, {
              mode: "interval",
              intervalValue: studentPageSize,
              pageSizeMode,
              insertAtEndIfRemainder: true // Luôn chèn ở cuối học sinh cuối nếu lẻ trang
            });
          } else {
            // Nếu số trang mỗi em là CHẴN, in hai mặt đã hoàn hảo, giữ nguyên file gốc
            res = {
              success: true,
              code: 200,
              message: "Giữ nguyên file gốc do số trang học sinh đã là số chẵn.",
              data: {
                pdfBytes: new Uint8Array(arrayBuffer),
                originalPageCount: fileItem.pageCount,
                newPageCount: fileItem.pageCount,
                insertedPositions: []
              }
            };
          }
        } else {
          // Các chế độ chèn thông thường
          res = await PdfBlankPageInserter.insertBlankPages(arrayBuffer, {
            mode,
            intervalValue,
            specificPages,
            pageSizeMode,
            insertAtEndIfRemainder
          });
        }

        if (res.success && res.data && res.data.pdfBytes) {
          const blob = new Blob([res.data.pdfBytes as any], { type: "application/pdf" });
          const downloadUrl = URL.createObjectURL(blob);
          const newName = `${fileItem.file.name.replace(/\.[^/.]+$/, "")}_with_blanks.pdf`;

          newResults.push({
            id: `res-${idx}-${Date.now()}`,
            fileName: newName,
            originalPageCount: res.data.originalPageCount,
            newPageCount: res.data.newPageCount,
            insertedCount: res.data.insertedPositions.length,
            downloadUrl
          });

          // Cho file đã xử lý vào ZIP
          zip.file(newName, res.data.pdfBytes);
        } else {
          throw new Error(`Xử lý thất bại tại file: "${fileItem.file.name}". Chi tiết: ${res.message}`);
        }
      }

      // Đóng gói tất cả các file PDF thành 1 file ZIP duy nhất
      if (newResults.length > 0) {
        setProcessingStatus("Đang nén tất cả các file đã xử lý thành định dạng ZIP...");
        setProgress(85);
        await new Promise((resolve) => setTimeout(resolve, 200));

        const zipBlob = await zip.generateAsync({ type: "blob" });
        const zipUrl = URL.createObjectURL(zipBlob);

        setZipDownloadUrl(zipUrl);
        setProcessedResults(newResults);
        setProgress(100);
        setProcessingStatus("Hoàn tất xử lý hàng loạt!");
      } else {
        throw new Error("Không có file PDF nào được xử lý thành công.");
      }

      setProcessing(false);
    } catch (err: any) {
      newResults.forEach((r) => URL.revokeObjectURL(r.downloadUrl));
      setErrorMsg(err?.message || "Đã xảy ra lỗi trong quá trình xử lý hàng loạt.");
      setProcessing(false);
    }
  };

  const handleReset = () => {
    handleClearAllFiles();
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  return (
    <div className="container">
      <header>
        <h1>PDF Blank Page Inserter</h1>
        <p className="subtitle">
          Công cụ chèn trang trắng tự động nhảy trang in 2 mặt cho học bạ vnEdu và tài liệu gộp hàng loạt trực tiếp trên trình duyệt. 
          Bảo mật tuyệt đối – File của bạn không upload lên server.
        </p>
      </header>

      <main className="app-card">
        {/* --- KHU VỰC CHỌN VÀ KÉO THẢ FILE PDF --- */}
        <div 
          className={`dropzone ${dragActive ? "drag-active" : ""}`}
          onDragEnter={handleDrag}
          onDragOver={handleDrag}
          onDragLeave={handleDrag}
          onDrop={handleDrop}
          onClick={onButtonClick}
          id="pdf-dropzone"
        >
          <input 
            ref={fileInputRef}
            type="file" 
            className="hidden"
            accept=".pdf"
            multiple
            onChange={handleFileChange}
            style={{ display: "none" }}
          />
          <div className="dropzone-icon">
            <FileUp size={32} />
          </div>
          <div className="dropzone-text">
            <h3>Kéo & thả một hoặc nhiều file PDF Học bạ vào đây</h3>
            <p>hoặc nhấn để duyệt file từ máy tính</p>
          </div>
          <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Hỗ trợ kéo thả đồng thời nhiều file PDF</span>
        </div>

        {/* --- DANH SÁCH FILE ĐANG CHỜ TRONG HÀNG ĐỢI --- */}
        {files.length > 0 && !processing && !zipDownloadUrl && (
          <div className="file-list-container" id="queued-files-panel">
            <div className="file-list-header">
              <span className="file-list-title">Danh sách file đã chọn ({files.length})</span>
              <button className="clear-all-btn" onClick={handleClearAllFiles} type="button">
                <Trash2 size={13} style={{ marginRight: "0.25rem" }} />
                <span>Xóa tất cả</span>
              </button>
            </div>
            
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {files.map((fileItem, idx) => (
                <div className="file-info-bar" key={`file-${idx}`} style={{ padding: "0.75rem 1.25rem" }}>
                  <div className="file-info-left">
                    <div className="file-icon" style={{ color: fileItem.error ? "var(--error)" : "#ef4444" }}>
                      <FileText size={22} />
                    </div>
                    <div className="file-meta">
                      <div className="file-name" title={fileItem.file.name} style={{ fontSize: "0.85rem", maxWidth: "450px" }}>
                        {fileItem.file.name}
                      </div>
                      <div className="file-size" style={{ fontSize: "0.75rem" }}>
                        {formatFileSize(fileItem.file.size)}
                        {fileItem.loading && (
                          <span style={{ color: "var(--primary)", marginLeft: "0.5rem" }}>• Đang phân tích số trang...</span>
                        )}
                        {!fileItem.loading && !fileItem.error && (
                          <span style={{ color: "var(--success)", marginLeft: "0.5rem", fontWeight: 600 }}>
                            • {fileItem.pageCount} trang
                          </span>
                        )}
                        {fileItem.error && (
                          <span style={{ color: "var(--error)", marginLeft: "0.5rem", fontWeight: 600 }}>
                            • {fileItem.error}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <button 
                    className="remove-file-btn" 
                    onClick={() => handleRemoveFile(idx)} 
                    title="Xóa khỏi danh sách"
                    aria-label={`Xóa file ${fileItem.file.name}`}
                    type="button"
                  >
                    <X size={16} />
                  </button>
                </div>
              ))}
            </div>

            <button className="add-more-btn" onClick={onButtonClick} type="button">
              <span>+ Chọn thêm file PDF khác</span>
            </button>
          </div>
        )}

        {/* --- HIỂN THỊ THÔNG BÁO LỖI --- */}
        {errorMsg && (
          <div className="alert" id="error-alert">
            <AlertCircle size={20} />
            <div>
              <strong>Lỗi hệ thống:</strong> {errorMsg}
            </div>
          </div>
        )}

        {/* --- BẢNG PHÂN TÍCH IN 2 MẶT THÔNG MINH (CHUYÊN BIỆT CHO vnEdu HỌC BẠ) --- */}
        {mode === "vnedu" && files.length > 0 && !processing && !zipDownloadUrl && (
          <div className="config-card" style={{ border: "1px solid rgba(139, 92, 246, 0.25)", background: "rgba(139, 92, 246, 0.02)", animation: "fadeIn 0.5s ease-out" }} id="duplex-analysis-panel">
            <div className="config-card-title">
              <HelpCircle size={18} style={{ color: "var(--primary)" }} />
              <span>Phân tích In 2 mặt Học bạ vnEdu</span>
            </div>
            
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {files.map((fileItem, idx) => {
                if (fileItem.loading) {
                  return (
                    <div key={`analysis-${idx}`} style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                      🔄 Đang quét cấu trúc file <em>{fileItem.file.name}</em>...
                    </div>
                  );
                }
                if (fileItem.error) {
                  return (
                    <div key={`analysis-${idx}`} style={{ fontSize: "0.85rem", color: "var(--error)" }}>
                      ❌ File <em>{fileItem.file.name}</em>: Không thể phân tích ({fileItem.error})
                    </div>
                  );
                }

                const pageCount = fileItem.pageCount;
                const studentPageSize = intervalValue;
                const remainder = pageCount % studentPageSize;
                const studentsCount = Math.floor(pageCount / studentPageSize);
                const isOdd = studentPageSize % 2 !== 0;

                return (
                  <div key={`analysis-${idx}`} style={{ display: "flex", flexDirection: "column", gap: "0.5rem", borderLeft: "2px solid rgba(255, 255, 255, 0.1)", paddingLeft: "1rem" }}>
                    <div style={{ fontWeight: 600, fontSize: "0.9rem", color: "var(--text-primary)" }}>
                      📄 {fileItem.file.name} ({pageCount} trang gốc)
                    </div>
                    
                    {remainder === 0 ? (
                      <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: "1.5" }}>
                        <div>• Ước tính lớp có: <strong>{studentsCount} học sinh</strong> (mỗi em {studentPageSize} trang).</div>
                        {isOdd ? (
                          <div style={{ marginTop: "0.25rem" }}>
                            <span style={{ color: "#fbbf24", fontWeight: 600 }}>⚠️ Cảnh báo Lẻ trang:</span> Mỗi em có {studentPageSize} trang (số lẻ). Khi in 2 mặt hàng loạt trực tiếp, học sinh sau sẽ bị in đè lên mặt sau của học sinh trước.
                            <div style={{ color: "var(--success)", fontWeight: 600, marginTop: "0.25rem" }}>
                              ✨ Giải pháp tự động: Hệ thống sẽ tự động chèn thêm 1 trang trắng sau mỗi học sinh (sau các trang {studentPageSize}, {studentPageSize * 2}, {studentPageSize * 3}...). Sau khi xử lý, mỗi học sinh có {studentPageSize + 1} trang (số chẵn), in 2 mặt tự động phân chia tờ hoàn hảo!
                            </div>
                          </div>
                        ) : (
                          <div style={{ marginTop: "0.25rem" }}>
                            <span style={{ color: "var(--success)", fontWeight: 600 }}>🟢 Trạng thái Chẵn trang:</span> Mỗi em đã có {studentPageSize} trang (số chẵn). Khi in hai mặt sẽ tự động chiếm trọn vẹn {studentPageSize / 2} tờ giấy.
                            <div style={{ color: "var(--text-muted)", marginTop: "0.25rem" }}>
                              ✨ Đề xuất: Không cần chèn trang trắng. Hệ thống sẽ giữ nguyên file gốc tối ưu của học sinh.
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div style={{ fontSize: "0.85rem", color: "#f87171", lineHeight: "1.5" }}>
                        <span style={{ fontWeight: 600 }}>🔴 Cảnh báo lệch trang:</span> Tổng số trang gốc ({pageCount}) không chia hết cho số trang mỗi học sinh ({studentPageSize}). 
                        <div>• Phát hiện có {studentsCount} học sinh đủ {studentPageSize} trang, và 1 học sinh cuối bị thiếu/thừa ({remainder} trang). Vui lòng kiểm tra lại file PDF gốc hoặc thiết lập số trang của học sinh.</div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* --- BẢNG CẤU HÌNH THÔNG SỐ CHÈN (HIỆN KHI CÓ FILE) --- */}
        {files.length > 0 && !processing && !zipDownloadUrl && (
          <div className="config-section" id="config-panel">
            
            {/* Cột 1: Quy luật Chèn */}
            <div className="config-card">
              <div className="config-card-title">
                <Layers size={18} />
                <span>Cấu hình Quy luật chèn</span>
              </div>
              
              <div className="form-group">
                <label>Chế độ chèn trang</label>
                <div className="tab-group">
                  <button 
                    className={`tab-btn ${mode === "vnedu" ? "active" : ""}`}
                    onClick={() => setMode("vnedu")}
                    type="button"
                  >
                    Học bạ vnEdu (Nhảy trang)
                  </button>
                  <button 
                    className={`tab-btn ${mode === "interval" ? "active" : ""}`}
                    onClick={() => setMode("interval")}
                    type="button"
                  >
                    Mỗi N trang
                  </button>
                  <button 
                    className={`tab-btn ${mode === "specific" ? "active" : ""}`}
                    onClick={() => setMode("specific")}
                    type="button"
                  >
                    Vị trí cụ thể
                  </button>
                </div>
              </div>

              {mode === "vnedu" && (
                <div className="form-group">
                  <label htmlFor="vnedu-input">Số trang học bạ gốc của mỗi học sinh</label>
                  <input 
                    id="vnedu-input"
                    type="number" 
                    min={1} 
                    value={intervalValue} 
                    onChange={(e) => setIntervalValue(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    className="input-control"
                  />
                  <span className="input-help-text">
                    Kiểm tra file học bạ vnEdu của bạn và nhập số trang của 1 học sinh (ví dụ: cấp tiểu học thường có 3 trang hoặc 5 trang).
                  </span>
                </div>
              )}

              {mode === "interval" && (
                <div className="form-group">
                  <label htmlFor="interval-input">Khoảng cách chèn trang (N)</label>
                  <input 
                    id="interval-input"
                    type="number" 
                    min={1} 
                    value={intervalValue} 
                    onChange={(e) => setIntervalValue(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    className="input-control"
                  />
                  <span className="input-help-text">
                    Một trang trắng sẽ được tự động chèn sau trang số N, 2N, 3N, 4N... của tất cả các file PDF gốc.
                  </span>
                </div>
              )}

              {mode === "specific" && (
                <div className="form-group">
                  <label htmlFor="specific-input">Chèn sau các trang thứ</label>
                  <input 
                    id="specific-input"
                    type="text" 
                    value={specificPagesInput}
                    onChange={(e) => setSpecificPagesInput(e.target.value)}
                    placeholder="Ví dụ: 3, 5, 8"
                    className="input-control"
                  />
                  <span className="input-help-text">
                    Nhập danh sách số trang, cách nhau bởi dấu phẩy. Trang trắng sẽ được thêm vào sau các trang gốc này.
                  </span>
                </div>
              )}
            </div>

            {/* Cột 2: Cài đặt nâng cao */}
            <div className="config-card">
              <div className="config-card-title">
                <Settings size={18} />
                <span>Cấu hình nâng cao</span>
              </div>

              <div className="form-group">
                <label htmlFor="page-size-select">Kích thước trang trắng</label>
                <select 
                  id="page-size-select"
                  value={pageSizeMode} 
                  onChange={(e: any) => setPageSizeMode(e.target.value)}
                  className="input-control"
                >
                  <option value="same-as-previous">Khớp kích thước trang trước (Khuyên dùng)</option>
                  <option value="a4">Khổ A4 tiêu chuẩn (595 x 842 pt)</option>
                  <option value="letter">Khổ Letter tiêu chuẩn (612 x 792 pt)</option>
                </select>
                <span className="input-help-text">
                  Kích thước trang trắng tự động co giãn theo khổ trang liền kề trước đó của mỗi file PDF gốc để tránh lệch tài liệu.
                </span>
              </div>

              {mode === "interval" && (
                <div className="toggle-group">
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                    <label style={{ color: "var(--text-primary)" }}>Chèn ở cuối nếu lẻ trang</label>
                    <span className="input-help-text">
                      Chèn thêm 1 trang trắng ở cuối cùng nếu tổng số trang của file đó không chia hết cho N.
                    </span>
                  </div>
                  <label className="toggle-container" htmlFor="end-remainder-toggle">
                    <input 
                      id="end-remainder-toggle"
                      type="checkbox" 
                      className="toggle-input"
                      checked={insertAtEndIfRemainder}
                      onChange={(e) => setInsertAtEndIfRemainder(e.target.checked)}
                    />
                    <div className="toggle-slider"></div>
                  </label>
                </div>
              )}

              {mode === "vnedu" && (
                <div style={{ padding: "0.5rem", borderRadius: "10px", background: "rgba(16, 185, 129, 0.03)", border: "1px solid rgba(16, 185, 129, 0.1)", fontSize: "0.8rem", color: "var(--text-secondary)", lineHeight: "1.4" }}>
                  💡 <strong>Quy trình in 2 mặt học bạ:</strong> <br/>
                  1. Tải lên file PDF gộp của lớp. <br/>
                  2. Nhập số trang học bạ của 1 em (ví dụ: 3). <br/>
                  3. Bấm chạy. Tải file kết quả về máy. <br/>
                  4. Khi in bằng Adobe Reader, chọn chế độ **Print on both sides** (In hai mặt) &rarr; Học bạ sẽ tự động tách tờ riêng biệt cho từng em cực kỳ chuyên nghiệp!
                </div>
              )}
            </div>

          </div>
        )}

        {/* --- NÚT HÀNH ĐỘNG CHÍNH --- */}
        {files.filter((f) => !f.loading && !f.error).length > 0 && !processing && !zipDownloadUrl && (
          <button 
            className="action-btn" 
            onClick={handleProcessPdfBatch}
            id="start-process-btn"
            type="button"
          >
            <span>Thực hiện xử lý in 2 mặt thông minh ({files.filter((f) => !f.loading && !f.error).length} file)</span>
            <ChevronRight size={18} />
          </button>
        )}

        {/* --- THÀNH PHẦN TIẾN TRÌNH XỬ LÝ (PROGRESS BAR) --- */}
        {processing && (
          <div className="progress-container" id="processing-progress">
            <div className="progress-header">
              <span className="progress-status">{processingStatus}</span>
              <span className="progress-percent">{progress}%</span>
            </div>
            <div className="progress-track">
              <div className="progress-bar" style={{ width: `${progress}%` }}></div>
            </div>
          </div>
        )}

        {/* --- GIAO DIỆN KẾT QUẢ VÀ TẢI XUỐNG HÀNG LOẠT (ZIP / LẺ) --- */}
        {zipDownloadUrl && processedResults.length > 0 && (
          <div className="result-container" id="success-result">
            <div className="result-icon">
              <Check size={32} />
            </div>
            <div>
              <h2 className="result-title">Đã xử lý in 2 mặt thành công!</h2>
              <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", marginTop: "0.5rem" }}>
                Đã phân tích và tối ưu nhảy trang 2 mặt cho **{processedResults.length} file PDF** trực tiếp trên trình duyệt.
              </p>
            </div>

            {/* Danh sách kết quả chi tiết từng file để tải lẻ */}
            <div style={{ width: "100%", maxWidth: "650px", textAlign: "left" }}>
              <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "0.5rem", display: "block" }}>
                Danh sách file đã hoàn thành ({processedResults.length} file)
              </span>
              <div className="results-list">
                {processedResults.map((resItem) => (
                  <div className="result-item-row" key={resItem.id}>
                    <div className="result-item-left">
                      <div style={{ color: "var(--success)" }}>
                        <FileText size={20} />
                      </div>
                      <div className="result-item-info">
                        <div className="result-item-name" title={resItem.fileName}>{resItem.fileName}</div>
                        <div className="result-item-meta">
                          Gốc: {resItem.originalPageCount} trang | Mới: {resItem.newPageCount} trang (+{resItem.insertedCount} trang trắng)
                        </div>
                      </div>
                    </div>
                    <a 
                      href={resItem.downloadUrl} 
                      download={resItem.fileName}
                      className="result-item-download"
                      title={`Tải xuống file ${resItem.fileName}`}
                    >
                      <FileDown size={14} />
                      <span>Tải lẻ</span>
                    </a>
                  </div>
                ))}
              </div>
            </div>

            {/* Hành động Tải toàn bộ ZIP / Làm lại */}
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "1rem", width: "100%" }}>
              <a 
                href={zipDownloadUrl} 
                download={`processed_pdf_documents_${Date.now()}.zip`}
                className="download-btn"
                id="download-pdf-btn"
                style={{ textDecoration: "none", background: "linear-gradient(135deg, var(--primary) 0%, #a78bfa 100%)", boxShadow: "0 4px 15px 0 var(--primary-glow)", display: "flex", alignItems: "center" }}
              >
                <FolderArchive size={18} />
                <span>Tải xuống tất cả (.ZIP)</span>
              </a>
              <button 
                className="reset-btn" 
                onClick={handleReset}
                id="reset-app-btn"
                type="button"
              >
                <RefreshCw size={16} style={{ marginRight: "0.5rem", verticalAlign: "middle" }} />
                <span>Xử lý lô mới</span>
              </button>
            </div>
          </div>
        )}
      </main>

      <footer>
        <p>
          Ứng dụng thiết kế bởi <strong>Principal DevOps & Enterprise Architect</strong>. Bảo mật tuyệt đối 100%.
        </p>
      </footer>
    </div>
  );
}
