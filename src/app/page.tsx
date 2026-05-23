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
  // Metadata quét text thông minh
  studentStarts: number[]; // Vị trí các trang bắt đầu của từng học sinh (1-indexed)
  studentSizes: number[]; // Số trang của từng học sinh tương ứng
  insertPositions: number[]; // Vị trí cần chèn trang trắng (1-indexed dựa trên file gốc)
}

interface ProcessedResultItem {
  id: string;
  fileName: string;
  originalPageCount: number;
  newPageCount: number;
  insertedCount: number;
  downloadUrl: string;
}

// Hàm tải thư viện PDF.js từ CDN ở Client-side
const loadPdfJS = (): Promise<any> => {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") return reject("Chỉ chạy trên trình duyệt");
    if ((window as any).pdfjsLib) {
      return resolve((window as any).pdfjsLib);
    }
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
    script.onload = () => {
      const pdfjsLib = (window as any).pdfjsLib;
      pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
      resolve(pdfjsLib);
    };
    script.onerror = () => reject("Không thể tải thư viện PDF.js quét text");
    document.head.appendChild(script);
  });
};

export default function Home() {
  // --- States ---
  const [files, setFiles] = useState<FileItem[]>([]);
  const [dragActive, setDragActive] = useState<boolean>(false);
  
  // Settings States
  // Chế độ: 'vnedu' (in 2 mặt thông minh), 'interval' (sau mỗi N trang), 'specific' (chọn trang cụ thể)
  const [mode, setMode] = useState<"vnedu" | "interval" | "specific">("vnedu");
  
  // vnEdu Smart Settings
  const [vneduMethod, setVneduMethod] = useState<"auto" | "fixed">("auto"); // auto: Quét từ khóa quét chữ, fixed: số trang cố định
  const [vneduKeyword, setVneduKeyword] = useState<string>("Quê quán"); // Từ khóa nhận biết trang lý lịch đầu tiên của mỗi học sinh
  
  // Chế độ thông thường
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

  // Dọn dẹp Blob URL
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

  // Quét lại phân tích học bạ khi từ khóa thay đổi
  useEffect(() => {
    if (mode === "vnedu" && vneduMethod === "auto" && files.length > 0) {
      const reAnalyze = async () => {
        const updatedFiles = [...files];
        let hasChange = false;

        for (let i = 0; i < updatedFiles.length; i++) {
          const item = updatedFiles[i];
          if (!item.loading && !item.error) {
            try {
              const buffer = await item.file.arrayBuffer();
              const analysis = await analyzePdfText(buffer, item.pageCount, vneduKeyword);
              updatedFiles[i] = {
                ...item,
                studentStarts: analysis.starts,
                studentSizes: analysis.sizes,
                insertPositions: analysis.inserts
              };
              hasChange = true;
            } catch (e) {
              console.error("Lỗi phân tích lại file", e);
            }
          }
        }

        if (hasChange) {
          setFiles(updatedFiles);
        }
      };
      
      reAnalyze();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vneduKeyword, vneduMethod, mode]);

  // --- Hàm quét chữ trích xuất text từng trang để tìm điểm phân chia học sinh ---
  const analyzePdfText = async (
    arrayBuffer: ArrayBuffer, 
    pageCount: number, 
    keyword: string
  ): Promise<{ starts: number[]; sizes: number[]; inserts: number[] }> => {
    const pdfjsLib = await loadPdfJS();
    
    // Load file bằng PDF.js CDN
    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
    const pdfDoc = await loadingTask.promise;
    
    const starts: number[] = [];
    
    // 1. Quét tìm tất cả các trang chứa từ khóa
    for (let i = 1; i <= pageCount; i++) {
      const page = await pdfDoc.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map((item: any) => item.str).join(" ");
      
      // CHUẨN HÓA UNICODE DỰNG SẴN (NFC) giải quyết triệt để lỗi lệch mã Tiếng Việt
      const normalizedText = pageText.normalize("NFC").toLowerCase();
      const normalizedKeyword = keyword.normalize("NFC").toLowerCase();
      
      if (normalizedText.includes(normalizedKeyword)) {
        starts.push(i);
      }
    }

    // Đảm bảo học sinh đầu tiên bắt đầu từ trang 1
    if (starts.length === 0 || starts[0] !== 1) {
      starts.unshift(1);
    }

    // 2. Tính toán số trang của từng học sinh và xác định vị trí chèn trang trắng
    const sizes: number[] = [];
    const inserts: number[] = [];

    for (let i = 0; i < starts.length; i++) {
      const start = starts[i];
      // Học sinh tiếp theo bắt đầu ở starts[i+1], hoặc nếu là em cuối cùng thì kết thúc ở trang cuối pageCount
      const end = (i < starts.length - 1) ? starts[i + 1] - 1 : pageCount;
      const size = end - start + 1;
      
      sizes.push(size);

      // Nếu số trang của học sinh này là số lẻ, chèn trang trắng sau trang cuối (end) của em đó
      if (size % 2 !== 0) {
        inserts.push(end);
      }
    }

    return { starts, sizes, inserts };
  };

  // --- Handlers ---
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

  // Xác minh định dạng PDF, đọc số trang tức thì, quét chữ thông minh và gộp vào hàng đợi
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

    // Tạo các item ở trạng thái loading
    const newItems: FileItem[] = pdfList.map((f) => ({
      file: f,
      pageCount: 0,
      loading: true,
      error: null,
      studentStarts: [],
      studentSizes: [],
      insertPositions: []
    }));

    // Cập nhật hàng đợi hiển thị spinner
    setFiles((prev) => [...prev, ...newItems]);

    // Bất đồng bộ load từng file để trích xuất số trang & quét chữ thông minh
    for (const item of newItems) {
      try {
        const buffer = await item.file.arrayBuffer();
        
        // 1. Lấy tổng số trang bằng pdf-lib
        const doc = await PDFDocument.load(buffer);
        const pages = doc.getPageCount();

        // 2. Chạy quét text thông minh bằng PDF.js CDN để phân tích cấu trúc học sinh dựa trên từ khóa Quê quán
        const textAnalysis = await analyzePdfText(buffer, pages, vneduKeyword);

        setFiles((prev) => 
          prev.map((f) => 
            f.file === item.file 
              ? { 
                  ...f, 
                  pageCount: pages, 
                  studentStarts: textAnalysis.starts,
                  studentSizes: textAnalysis.sizes,
                  insertPositions: textAnalysis.inserts,
                  loading: false 
                } 
              : f
          )
        );

        // Gợi ý cấu hình trang cố định
        const commonPageSizes = [3, 4, 5, 6];
        const divisors = commonPageSizes.filter((size) => pages % size === 0);
        if (divisors.length > 0) {
          setIntervalValue(divisors[0]);
        }
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
    const validFiles = files.filter((f) => !f.loading && !f.error);
    if (validFiles.length === 0) return;

    setProcessing(true);
    setProgress(5);
    setProcessingStatus("Khởi động tiến trình xử lý hàng loạt...");
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
      // Phân tích các chế độ in
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

        setProcessingStatus(`[File ${fileNum}/${validFiles.length}] Đang xử lý: ${fileItem.file.name}...`);
        
        // Chia đều thanh tiến trình theo số lượng file
        const fileProgressStart = Math.floor((idx / validFiles.length) * 80) + 5;
        setProgress(fileProgressStart);

        const arrayBuffer = await fileItem.file.arrayBuffer();
        await new Promise((resolve) => setTimeout(resolve, 150));

        let res;

        // --- CHẾ ĐỘ 1: vnEdu HỌC BẠ / IN 2 MẶT THÔNG MINH ---
        if (mode === "vnedu") {
          if (vneduMethod === "auto") {
            // TỰ ĐỘNG NHẬN DIỆN CHỮ: Chèn trang trắng tại các vị trí lẻ trang đã quét được
            const insertPositions = fileItem.insertPositions;
            
            // Xử lý Fallback: Nếu không tìm thấy bất kỳ trang phân chia nào (quét lỗi hoặc từ khóa sai)
            if (fileItem.studentStarts.length <= 1) {
              throw new Error(`Không quét được từ khóa "${vneduKeyword}" trong file: "${fileItem.file.name}". Vui lòng kiểm tra lại từ khóa lý lịch hoặc chuyển sang chế độ "Số trang cố định" và thực hiện lại.`);
            }

            if (insertPositions.length > 0) {
              res = await PdfBlankPageInserter.insertBlankPages(arrayBuffer, {
                mode: "specific",
                specificPages: insertPositions,
                pageSizeMode
              });
            } else {
              // Mọi học sinh đều có số trang chẵn, giữ nguyên file gốc
              res = {
                success: true,
                code: 200,
                message: "Tất cả học sinh đều có số trang chẵn. Giữ nguyên file gốc.",
                data: {
                  pdfBytes: new Uint8Array(arrayBuffer),
                  originalPageCount: fileItem.pageCount,
                  newPageCount: fileItem.pageCount,
                  insertedPositions: []
                }
              };
            }
          } else {
            // CHIA TRANG CỐ ĐỊNH (FIXED METHOD)
            const studentPageSize = intervalValue;
            const isOdd = studentPageSize % 2 !== 0;

            if (isOdd) {
              res = await PdfBlankPageInserter.insertBlankPages(arrayBuffer, {
                mode: "interval",
                intervalValue: studentPageSize,
                pageSizeMode,
                insertAtEndIfRemainder: true
              });
            } else {
              res = {
                success: true,
                code: 200,
                message: "Giữ nguyên file gốc do cấu hình số trang học sinh đã là số chẵn.",
                data: {
                  pdfBytes: new Uint8Array(arrayBuffer),
                  originalPageCount: fileItem.pageCount,
                  newPageCount: fileItem.pageCount,
                  insertedPositions: []
                }
              };
            }
          }
        } else {
          // --- CHẾ ĐỘ THÔNG THƯỜNG ---
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

          zip.file(newName, res.data.pdfBytes);
        } else {
          throw new Error(`Xử lý thất bại tại file: "${fileItem.file.name}". Chi tiết: ${res.message}`);
        }
      }

      // Đóng gói thành file ZIP
      if (newResults.length > 0) {
        setProcessingStatus("Đang đóng gói và nén tất cả các file thành định dạng ZIP...");
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
          Công cụ tự động nhận diện và bù trang trắng in 2 mặt cho học bạ vnEdu cực kỳ khôn ngoan, kể cả khi học sinh bị nhảy trang. 
          Bảo mật 100% – Chạy trực tiếp trên trình duyệt.
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
          <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Hỗ trợ xử lý song song nhiều file PDF</span>
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
                          <span style={{ color: "var(--primary)", marginLeft: "0.5rem" }}>
                            • 🔄 Đang quét chữ nhận diện học sinh...
                          </span>
                        )}
                        {!fileItem.loading && !fileItem.error && (
                          <span style={{ color: "var(--success)", marginLeft: "0.5rem", fontWeight: 600 }}>
                            • {fileItem.pageCount} trang gốc • Tìm thấy {fileItem.studentStarts.length} học sinh
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
              <span>Bảng phân tích in ấn 2 mặt thông minh</span>
            </div>
            
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {files.map((fileItem, idx) => {
                if (fileItem.loading) {
                  return (
                    <div key={`analysis-${idx}`} style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                      🔄 Đang quét chữ tìm điểm bắt đầu của từng em trong file <em>{fileItem.file.name}</em>...
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

                const starts = fileItem.studentStarts;
                const sizes = fileItem.studentSizes;
                const inserts = fileItem.insertPositions;
                const hasNhayTrang = sizes.some((s, i) => i > 0 && s !== sizes[0]);

                return (
                  <div key={`analysis-${idx}`} style={{ display: "flex", flexDirection: "column", gap: "0.5rem", borderLeft: "2px solid rgba(255, 255, 255, 0.1)", paddingLeft: "1rem" }}>
                    <div style={{ fontWeight: 600, fontSize: "0.9rem", color: "var(--text-primary)" }}>
                      📄 {fileItem.file.name} ({fileItem.pageCount} trang gốc)
                    </div>
                    
                    {vneduMethod === "auto" ? (
                      /* HIỂN THỊ PHÂN TÍCH TỰ ĐỘNG QUA QUÉT CHỮ */
                      <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: "1.5" }}>
                        
                        {starts.length <= 1 ? (
                          /* CẢNH BÁO KHI QUÉT THẤT BẠI - CHUYỂN DỰ PHÒNG */
                          <div style={{ color: "#f87171", padding: "0.5rem", borderRadius: "8px", background: "rgba(239, 68, 68, 0.05)", border: "1px solid rgba(239, 68, 68, 0.15)" }}>
                            ⚠️ <strong>Quét chữ thất bại:</strong> Không tìm thấy từ khóa lý lịch <strong>&quot;{vneduKeyword}&quot;</strong> trong file PDF này. <br/>
                            &rarr; <em>Vui lòng kiểm tra lại từ khóa hoặc chuyển sang chế độ <strong>&quot;Số trang cố định&quot;</strong> để hệ thống tự động chia đều (ví dụ: nhập 3 trang mỗi em) và chèn chính xác 100%!</em>
                          </div>
                        ) : (
                          /* QUÉT THÀNH CÔNG RỰC RỠ */
                          <>
                            <div>• Trích xuất thành công: Tìm thấy <strong>{starts.length} học sinh</strong> dựa trên từ khóa lý lịch độc bản <em>&quot;{vneduKeyword}&quot;</em>.</div>
                            
                            {hasNhayTrang && (
                              <div style={{ margin: "0.25rem 0", color: "#fbbf24", fontWeight: 600 }}>
                                ⚠️ Phát hiện có học sinh bị nhảy trang! (Số trang mỗi học sinh không đồng đều, dao động từ {Math.min(...sizes)} đến {Math.max(...sizes)} trang).
                              </div>
                            )}

                            <div style={{ margin: "0.5rem 0", background: "rgba(0,0,0,0.2)", padding: "0.5rem 0.75rem", borderRadius: "8px", maxHeight: "120px", overflowY: "auto" }}>
                              <span style={{ fontSize: "0.75rem", fontWeight: 600, display: "block", marginBottom: "0.25rem", color: "var(--text-muted)" }}>
                                Cấu trúc bù trang chi tiết:
                              </span>
                              {starts.map((startPage, index) => {
                                const size = sizes[index];
                                const isOdd = size % 2 !== 0;
                                return (
                                  <div key={`student-${index}`} style={{ fontSize: "0.75rem", display: "flex", justifyContent: "space-between", padding: "0.15rem 0" }}>
                                    <span>Học sinh {index + 1}: Trang {startPage} &rarr; {startPage + size - 1} ({size} trang)</span>
                                    {isOdd ? (
                                      <span style={{ color: "#fbbf24", fontWeight: 600 }}>Cần chèn +1 trang trắng sau trang {startPage + size - 1}</span>
                                    ) : (
                                      <span style={{ color: "var(--success)", fontWeight: 600 }}>Đã tối ưu (Chẵn trang)</span>
                                    )}
                                  </div>
                                );
                              })}
                            </div>

                            {inserts.length > 0 ? (
                              <div style={{ color: "var(--success)", fontWeight: 600 }}>
                                ✨ Thuật toán thông minh sẽ tự động chèn thêm {inserts.length} trang trắng vào đúng vị trí cuối phần học bạ của các em bị lẻ trang (trang {inserts.join(", ")}). Đảm bảo in 2 mặt nhảy trang chính xác 100%!
                              </div>
                            ) : (
                              <div style={{ color: "var(--success)", fontWeight: 600 }}>
                                🟢 Tất cả các học sinh đều có số trang chẵn. in hai mặt đã tối ưu, không cần chèn thêm trang trắng!
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    ) : (
                      /* HIỂN THỊ PHÂN TÍCH CHIA ĐỀU CỐ ĐỊNH */
                      <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: "1.5" }}>
                        <div>• Ước tính lớp có: <strong>{Math.floor(fileItem.pageCount / intervalValue)} học sinh</strong> (mỗi em {intervalValue} trang).</div>
                        {intervalValue % 2 !== 0 ? (
                          <div style={{ marginTop: "0.25rem" }}>
                            <span style={{ color: "#fbbf24", fontWeight: 600 }}>⚠️ Cảnh báo Lẻ trang:</span> Mỗi em có {intervalValue} trang (số lẻ). 
                            <div style={{ color: "var(--success)", fontWeight: 600, marginTop: "0.25rem" }}>
                              ✨ Giải pháp: Hệ thống tự động chèn 1 trang trắng sau mỗi {intervalValue} trang (sau các trang {Array.from({ length: Math.floor(fileItem.pageCount / intervalValue) }, (_, i) => (i + 1) * intervalValue).join(", ")}).
                            </div>
                          </div>
                        ) : (
                          <div style={{ marginTop: "0.25rem" }}>
                            <span style={{ color: "var(--success)", fontWeight: 600 }}>🟢 Trạng thái Chẵn trang:</span> Mỗi em đã có {intervalValue} trang (số chẵn).
                          </div>
                        )}
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

              {/* CẤU HÌNH CHO vnEdu SMART MODE */}
              {mode === "vnedu" && (
                <>
                  <div className="form-group">
                    <label>Phương pháp nhận diện điểm phân chia học sinh</label>
                    <div className="tab-group">
                      <button 
                        className={`tab-btn ${vneduMethod === "auto" ? "active" : ""}`}
                        onClick={() => setVneduMethod("auto")}
                        type="button"
                      >
                        Quét chữ tự động (AI Auto)
                      </button>
                      <button 
                        className={`tab-btn ${vneduMethod === "fixed" ? "active" : ""}`}
                        onClick={() => setVneduMethod("fixed")}
                        type="button"
                      >
                        Số trang cố định
                      </button>
                    </div>
                  </div>

                  {vneduMethod === "auto" ? (
                    <div className="form-group">
                      <label htmlFor="keyword-select">Từ khóa lý lịch nhận diện học sinh mới</label>
                      <select 
                        id="keyword-select"
                        value={vneduKeyword} 
                        onChange={(e) => setVneduKeyword(e.target.value)}
                        className="input-control"
                      >
                        <option value="Quê quán">Quê quán (Khuyên dùng - vnEdu cực chuẩn)</option>
                        <option value="Dân tộc">Dân tộc (Mục lý lịch)</option>
                        <option value="Nơi sinh">Nơi sinh (Mục lý lịch)</option>
                        <option value="Ngày sinh">Ngày sinh (Mục lý lịch)</option>
                        <option value="HỌC BẠ">HỌC BẠ (Trang bìa lớn)</option>
                      </select>
                      <span className="input-help-text">
                        Hệ thống sẽ quét từng trang PDF, trang nào có chứa từ khóa này sẽ được định vị là trang bắt đầu của một học sinh mới (Trang lý lịch).
                      </span>
                    </div>
                  ) : (
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
                        Thích hợp khi tất cả học sinh đều tăm tắp có cùng số trang (ví dụ tất cả đều 3 trang).
                      </span>
                    </div>
                  )}
                </>
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
                  💡 <strong>Tại sao AI Auto-detect khôn hơn?</strong> <br/>
                  * Quét và đọc text thực tế của từng trang PDF. <br/>
                  * Tự động nhận diện ranh giới từng học sinh bằng từ khóa lý lịch độc bản (như Quê quán). <br/>
                  * Tự động tính chẵn lẻ của riêng học sinh đó để chèn trang trắng bù vào cuối em đó chuẩn 100%, không lo lệch in ấn hàng loạt!
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
                Đã quét chữ thông minh và tối ưu bù trang 2 mặt cho **{processedResults.length} file PDF** trực tiếp trên trình duyệt.
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
