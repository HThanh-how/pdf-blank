import { PDFDocument } from 'pdf-lib';

export interface PdfProcessingOptions {
  mode: 'interval' | 'specific';
  intervalValue?: number; // Cho chế độ 'interval' (hàng loạt)
  specificPages?: number[]; // Cho chế độ 'specific' (trang chỉ định, ví dụ: [3, 5])
  pageSizeMode: 'same-as-previous' | 'a4' | 'letter';
  insertAtEndIfRemainder?: boolean; // Có chèn ở cuối nếu số trang lẻ không chia hết cho khoảng cách không?
}

export interface PdfProcessingResult {
  success: boolean;
  code: number;
  message: string;
  data: {
    pdfBytes: Uint8Array | null;
    originalPageCount: number;
    newPageCount: number;
    insertedPositions: number[]; // Vị trí các trang trắng đã chèn trong file mới (1-indexed)
  } | null;
  errors: string[] | null;
  trace_id: string;
}

/**
 * Sinh UUID v4 đơn giản cho Trace ID
 */
function generateUUID(): string {
  if (typeof window !== 'undefined' && window.crypto && window.crypto.randomUUID) {
    return window.crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Ghi log có cấu trúc chuẩn JSON
 */
function logStructured(level: 'INFO' | 'ERROR' | 'WARN', message: string, context: Record<string, any>) {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    trace_id: context.trace_id || 'system',
    context,
    message
  }));
}

export class PdfBlankPageInserter {
  /**
   * Đọc file PDF và chèn trang trắng dựa trên cấu hình tùy chọn
   * @param pdfArrayBuffer Dữ liệu ArrayBuffer của file PDF gốc
   * @param options Các tham số cấu hình chèn trang
   */
  static async insertBlankPages(
    pdfArrayBuffer: ArrayBuffer,
    options: PdfProcessingOptions
  ): Promise<PdfProcessingResult> {
    const trace_id = generateUUID();
    logStructured('INFO', 'Bắt đầu xử lý chèn trang trắng vào PDF', { trace_id, mode: options.mode });

    try {
      // 1. Load tài liệu PDF gốc
      // pdf-lib sẽ tự động throw error nếu file bị mã hóa mật khẩu hoặc bị hỏng
      const srcDoc = await PDFDocument.load(pdfArrayBuffer);
      const originalPageCount = srcDoc.getPageCount();
      
      logStructured('INFO', `Đã load file PDF thành công. Số trang gốc: ${originalPageCount}`, { trace_id, originalPageCount });

      if (originalPageCount === 0) {
        throw new Error('Tài liệu PDF tải lên không có trang nào.');
      }

      // 2. Xác định các vị trí trang gốc cần chèn trang trắng sau đó
      const targetInsertAfterPages = new Set<number>();

      if (options.mode === 'interval') {
        const step = options.intervalValue || 3;
        if (step <= 0) {
          throw new Error('Khoảng cách trang chèn phải lớn hơn 0.');
        }

        // Chèn hàng loạt sau mỗi N trang
        for (let i = step; i <= originalPageCount; i += step) {
          targetInsertAfterPages.add(i);
        }

        // Xử lý Edge Case: Chèn ở cuối file nếu tổng số trang gốc không chia hết cho N
        if (options.insertAtEndIfRemainder && originalPageCount % step !== 0) {
          targetInsertAfterPages.add(originalPageCount);
          logStructured('INFO', 'Kích hoạt chèn trang trắng ở cuối file do số trang không chia hết', { trace_id, originalPageCount, step });
        }
      } else {
        // Chế độ chỉ định trang cụ thể
        const pages = options.specificPages || [];
        pages.forEach((p) => {
          if (p > 0 && p <= originalPageCount) {
            targetInsertAfterPages.add(p);
          } else {
            logStructured('WARN', `Bỏ qua trang chỉ định không hợp lệ (vượt quá giới hạn): ${p}`, { trace_id, originalPageCount });
          }
        });
      }

      // 3. Khởi tạo tài liệu PDF mới để sao chép trang và chèn trang trắng
      const destDoc = await PDFDocument.create();
      const copiedPages = await destDoc.copyPages(srcDoc, srcDoc.getPageIndices());
      
      const insertedPositions: number[] = [];
      let currentPageInNewDoc = 0;

      // 4. Duyệt qua từng trang và tiến hành sao chép + chèn
      for (let i = 0; i < copiedPages.length; i++) {
        const pageNumInOriginal = i + 1;
        const page = copiedPages[i];

        // Sao chép trang gốc vào file mới
        destDoc.addPage(page);
        currentPageInNewDoc++;

        // Kiểm tra xem trang này có cần chèn thêm trang trắng phía sau không
        if (targetInsertAfterPages.has(pageNumInOriginal)) {
          // Xác định kích thước trang trắng theo cấu hình
          let width = 595.27;  // A4 Width default in points
          let height = 841.89; // A4 Height default in points

          if (options.pageSizeMode === 'same-as-previous') {
            const size = page.getSize();
            width = size.width;
            height = size.height;
          } else if (options.pageSizeMode === 'letter') {
            width = 612;
            height = 792;
          }

          // Chèn trang trắng mới ngay sau trang hiện tại
          destDoc.addPage([width, height]);
          currentPageInNewDoc++;
          insertedPositions.push(currentPageInNewDoc);
        }
      }

      // 5. Lưu lại tài liệu đã chèn trang trắng
      const pdfBytes = await destDoc.save();
      const newPageCount = destDoc.getPageCount();

      logStructured('INFO', 'Hoàn tất chèn trang trắng PDF thành công', {
        trace_id,
        originalPageCount,
        newPageCount,
        insertedPositionsCount: insertedPositions.length,
        insertedPositions
      });

      return {
        success: true,
        code: 200,
        message: `Chèn thành công ${insertedPositions.length} trang trắng vào PDF.`,
        data: {
          pdfBytes,
          originalPageCount,
          newPageCount,
          insertedPositions
        },
        errors: null,
        trace_id
      };

    } catch (error: any) {
      const errorMessage = error?.message || '';
      logStructured('ERROR', `Gặp lỗi khi xử lý PDF: ${errorMessage}`, {
        trace_id,
        errorStack: error?.stack
      });

      // Bắt lỗi mã hóa mật khẩu hoặc file PDF bị hỏng
      const isEncrypted = errorMessage.toLowerCase().includes('encrypted') || 
                          errorMessage.toLowerCase().includes('password') || 
                          errorMessage.toLowerCase().includes('decrypt');
      
      const userFriendlyMessage = isEncrypted
        ? 'File PDF đã được bảo vệ bằng mật khẩu hoặc bị mã hóa. Vui lòng loại bỏ mật khẩu bảo vệ trước khi tải lên công cụ.'
        : `Không thể đọc hoặc xử lý file PDF này. Chi tiết lỗi: ${errorMessage || 'Định dạng file không hợp lệ.'}`;

      return {
        success: false,
        code: 500,
        message: userFriendlyMessage,
        data: null,
        errors: [errorMessage || 'Lỗi xử lý định dạng PDF'],
        trace_id
      };
    }
  }
}
