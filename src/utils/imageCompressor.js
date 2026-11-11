/**
 * Tiện ích nén hình ảnh sử dụng HTML5 <canvas>
 * Tự động resize ảnh về chiều rộng tối đa (mặc định 600px) và chất lượng JPEG 0.6.
 * Kết quả tạo ra chuỗi Base64 rất nhẹ (< 30KB), phù hợp lưu trữ LocalStorage / Database
 * với kích thước tối ưu.
 */
export function compressImage(file, maxWidth = 600, quality = 0.6) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith("image/")) {
      return reject(new Error("Vui lòng chọn một tệp hình ảnh hợp lệ (PNG, JPG, WEBP)."));
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Không thể đọc tệp hình ảnh."));
    reader.onload = (event) => {
      const img = new Image();
      img.onerror = () => reject(new Error("Không thể nạp hình ảnh để xử lý."));
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        // Giữ nguyên tỷ lệ khung hình
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");

        // Đổ nền trắng để xử lý ảnh PNG trong suốt khi xuất sang JPEG
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        // Xuất ra base64 jpeg nhẹ
        const base64String = canvas.toDataURL("image/jpeg", quality);
        resolve(base64String);
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  });
}

