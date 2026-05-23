import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PDF Blank Page Inserter | Chèn Trang Trắng PDF Hàng Loạt",
  description: "Công cụ trực tuyến cao cấp hỗ trợ chèn trang trắng hàng loạt sau mỗi N trang hoặc tại các trang chỉ định vào file PDF. Bảo mật dữ liệu 100%, xử lý trực tiếp trên trình duyệt.",
  keywords: [
    "pdf blank page inserter",
    "chèn trang trắng pdf",
    "chèn trang trắng hàng loạt",
    "thêm trang trắng vào pdf",
    "chỉnh sửa pdf online",
    "pdf utility online"
  ],
  authors: [{ name: "Enterprise Architect & Principal DevOps" }],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi">
      <body>
        {children}
      </body>
    </html>
  );
}
