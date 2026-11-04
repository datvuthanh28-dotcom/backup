# MAISON RUE — PRODUCT DATA CONTRACT

Phiên bản: 2.0 — đồng bộ catalog 103 sản phẩm  
Mục đích: Đây là khung bắt buộc để tạo mới hoặc thay thế catalog Maison Rue mà không phải sửa lại frontend, Staff Portal, checkout và nghiệp vụ kho.

## 1. Nguyên tắc không được thay đổi

1. `Sản phẩm` là mẫu hàng chung, không phải đơn vị tồn kho.
2. Mỗi sản phẩm có đúng một `product_code`, ví dụ `MR-106`.
3. Mỗi tổ hợp màu và kích cỡ là một SKU bán được độc lập, ví dụ `MR-106-BROWN-M`.
4. Tồn kho, Min và Max chỉ được quản lý tại SKU.
5. Tổng tồn của sản phẩm luôn bằng tổng `stock_quantity` của các SKU đang hoạt động; không nhập tổng tồn thủ công.
6. Không tạo SKU cha hoặc SKU con. Cấp cha là `product_code`; cấp bán hàng là `sku`.
7. Không lưu trạng thái kho thành cột dữ liệu. Trạng thái phải được tính từ tồn kho, Min và Max.
8. Mã sản phẩm, SKU và slug không được tái sử dụng cho một sản phẩm khác.

## 2. Phân nhóm chuẩn của catalog hiện tại

Chỉ sử dụng các mã danh mục dưới đây nếu chưa có quyết định thay đổi taxonomy toàn hệ thống.

| `productType` | `category` dẫn xuất | Ý nghĩa |
|---|---|---|
| `Clothing` | `clothing` | Trang phục |
| `Footwear` | `footwear` | Giày dép |
| `Accessories` | `accessories` | Phụ kiện |

`subcategory` mô tả nhóm nhỏ như `Knitwear`, `Shirts`, `Outerwear`, `Shoes`, `Bags`, `Hats`, `Toys` và được dùng cho bộ lọc danh mục.

Đối tượng hợp lệ:

- `nam` với `audience: "men"`
- `nữ` với `audience: "women"`
- `kids` với `audience: "kids"`

Không dùng đồng thời các giá trị như `men`, `male`, `women`, `female` trong dữ liệu nguồn.

## 3. Cấu trúc một sản phẩm nguồn

Mỗi sản phẩm trong catalog nguồn phải có đầy đủ cấu trúc sau:

```js
{
  id: 106,
  productCode: "MR-106",
  name: "Merino Wool Knitted Polo",
  slug: "men-merino-wool-knitted-polo-106",
  price: 4890000,

  audience: "men",
  category: "clothing",
  productType: "Clothing",
  subcategory: "Knitwear",
  gender: "nam",
  collection: "Riviera Linen",

  description: "Mô tả sản phẩm hoàn chỉnh.",
  fit: "Relaxed Tailored Fit",
  material: "70% European linen, 30% organic cotton",
  care: "Hướng dẫn bảo quản.",
  modelInfo: "Model is 184 cm and wears size M.",
  features: ["Đặc điểm 1", "Đặc điểm 2"],
  delivery: "Thông tin giao hàng và đổi trả.",

  colors: ["IVORY WHITE", "NAVY BLUE"],
  colorOptions: [
    { name: "IVORY WHITE", hex: "#F2EEE4" },
    { name: "NAVY BLUE", hex: "#1F2A44" }
  ],
  sizes: ["XS", "S", "M", "L", "XL"],

  images: [
    "image/catalog/men/riviera-linen-shirt/ivory-white-studio.webp",
    "image/catalog/men/riviera-linen-shirt/ivory-white-model.webp",
    "image/catalog/men/riviera-linen-shirt/ivory-white-detail.webp"
  ],
  colorImages: {
    "IVORY WHITE": [
      "image/catalog/men/riviera-linen-shirt/ivory-white-studio.webp",
      "image/catalog/men/riviera-linen-shirt/ivory-white-model.webp",
      "image/catalog/men/riviera-linen-shirt/ivory-white-detail.webp"
    ],
    "NAVY BLUE": [
      "image/catalog/men/riviera-linen-shirt/navy-blue-studio.webp"
    ]
  },

  variants: [
    {
      id: "v-106-brown-m",
      sku: "MR-106-BROWN-M",
      color: "Brown",
      size: "M",
      price: 4890000,
      stock: 8,
      minStock: 3,
      maxStock: 20
    }
  ],

  sizeGuide: [
    { size: "M", chest: 104, waist: 84, length: 70 }
  ]
}
```

## 4. Quy tắc mã sản phẩm và SKU

### Mã sản phẩm

Định dạng:

```text
MR-{ID gồm ít nhất 3 chữ số}
```

Ví dụ:

```text
ID 106 → MR-106
ID 105 → MR-105
```

### SKU biến thể

Định dạng:

```text
{PRODUCT_CODE}-{COLOR_CODE}-{SIZE_CODE}
```

Ví dụ:

```text
MR-106-BROWN-M
MR-106-BEIGE-L
MR-042-DARK-CHOCOLATE-ONE-SIZE
```

Quy tắc chuẩn hóa:

- Chỉ dùng chữ in hoa ASCII, chữ số và dấu gạch ngang.
- Bỏ dấu tiếng Việt trong mã.
- Khoảng trắng chuyển thành dấu gạch ngang.
- Không dùng `/`, `&`, dấu chấm hoặc ký tự đặc biệt trong SKU.
- `ProductVariants.sku` phải duy nhất toàn database.
- Một sản phẩm không được có hai SKU cùng màu và cùng kích cỡ.

## 5. Quy tắc màu và kích cỡ

1. Mọi giá trị trong `colors` phải có một phần tử tương ứng trong `colorOptions`.
2. Tên màu trong `variants.color` phải trùng chính xác với tên trong `colors`.
3. Kích cỡ trong `variants.size` phải tồn tại trong `sizes`.
4. Mỗi tổ hợp `color + size` xuất hiện đúng một lần.
5. Hệ kích cỡ hợp lệ hiện tại:
   - Thời trang: `XS`, `S`, `M`, `L`, `XL`.
   - Giày: `36` đến `43`, tùy đối tượng.
   - Phụ kiện: `ONE SIZE`.
6. Không dùng `FREE SIZE`, `ONESIZE` hoặc `One Size` song song với `ONE SIZE`.

## 6. Quy tắc hình ảnh

1. Ảnh phải dùng đường dẫn tương đối, không bắt đầu bằng `/`.
2. Mỗi sản phẩm có một màu chính.
3. Màu chính nên có tối thiểu ba ảnh riêng biệt:
   - ảnh studio;
   - ảnh người mẫu mặc hoặc sử dụng;
   - ảnh chi tiết chất liệu/đường may.
4. Mỗi màu còn lại phải có ít nhất một ảnh riêng đúng màu.
5. `images` là gallery mặc định của màu chính.
6. `colorImages[color]` chứa gallery riêng của màu đó.
7. Không ghép nhiều góc chụp vào một file ảnh.
8. Tên file đề xuất:

```text
{color-slug}-studio.webp
{color-slug}-model.webp
{color-slug}-detail.webp
```

9. Không tham chiếu file không tồn tại. Mọi ảnh phải được kiểm tra trước khi seed.

## 7. Quy tắc tồn kho

Mỗi SKU phải có:

| Trường | Điều kiện |
|---|---|
| `stock` | Số nguyên, `>= 0` |
| `minStock` | Số nguyên, `>= 0` |
| `maxStock` | Số nguyên, `> minStock` |

Trạng thái được tính động:

| Trạng thái | Điều kiện |
|---|---|
| Hết hàng | `stock = 0` |
| Sắp hết | `0 < stock <= minStock` |
| Ổn định | `minStock < stock < maxStock` |
| Vượt mức tồn | `stock >= maxStock` |

Mặc định dùng khi chưa có phân tích nhu cầu:

```text
minStock = 3
maxStock = 20
```

## 8. Ánh xạ sang MSSQL

### `Products`

| Cột | Nguồn | Quy tắc |
|---|---|---|
| `id` | `product.id` | Khóa chính, ổn định |
| `product_code` | `product.productCode` | Unique, Not Null |
| `name` | `product.name` | Not Null |
| `price` | `product.price` | `> 0` |
| `category` | `product.category` | Mã danh mục chuẩn |
| `gender` | `product.gender` | `nam`, `nữ`, `kids` |
| `images_json` | `product.images` | JSON hợp lệ |
| `colors_json` | `product.colors` | JSON hợp lệ |
| `color_images_json` | `product.colorImages` | JSON hợp lệ |
| `description` | `product.description` | Không để trống |
| `stock` | Tổng SKU | Giá trị dẫn xuất, không nhập tay |

### `ProductVariants`

| Cột | Nguồn | Quy tắc |
|---|---|---|
| `id` | `variant.id` | Khóa chính ổn định |
| `product_id` | `product.id` | Foreign Key |
| `sku` | `variant.sku` | Unique, Not Null |
| `color_name` | `variant.color` | Phải thuộc màu sản phẩm |
| `size_name` | `variant.size` | Phải thuộc kích cỡ sản phẩm |
| `price` | `variant.price` | Mặc định bằng giá sản phẩm |
| `stock_quantity` | `variant.stock` | `>= 0` |
| `low_stock_threshold` | `variant.minStock` | `>= 0` |
| `max_stock_threshold` | `variant.maxStock` | `> low_stock_threshold` |
| `is_active` | mặc định | `1` |

Các dữ liệu chi tiết như `fit`, `material`, `care`, `modelInfo`, `features`, `delivery`, `sizeGuide` hiện vẫn phải có trong catalog nguồn để trang chi tiết hoạt động đầy đủ. Không được chỉ tạo hai bảng SQL rồi bỏ các trường này.

## 9. Trình tự tạo catalog/database mới

1. Chốt taxonomy và danh sách sản phẩm.
2. Gán `id`, `productCode` và `slug` duy nhất.
3. Khai báo màu, mã màu và kích cỡ.
4. Tạo đầy đủ ma trận SKU màu–kích cỡ cần bán.
5. Gán tồn kho, Min và Max cho từng SKU.
6. Chuẩn bị ảnh và kiểm tra tất cả đường dẫn.
7. Kiểm tra mô tả, chất liệu, bảo quản và bảng kích cỡ.
8. Chạy schema và migrations theo thứ tự.
9. Chạy `server/db/seed-catalog-only.js`; không dùng seed đơn hàng mẫu khi chỉ thay catalog.
10. Kiểm tra API `/api/products`, trang danh mục, trang chi tiết và Staff Inventory.
11. Chỉ sau khi catalog ổn định mới kiểm thử checkout và báo cáo.

## 10. Checklist nghiệm thu bắt buộc

- [ ] Không trùng `id`, `productCode`, `slug`, `variant.id` hoặc `sku`.
- [ ] Mọi sản phẩm thuộc đúng một category và một gender chuẩn.
- [ ] Mọi màu có mã hex và ảnh riêng.
- [ ] Màu chính có gallery nhiều góc chụp.
- [ ] Mọi SKU tham chiếu đúng màu và kích cỡ của sản phẩm.
- [ ] Không thiếu tổ hợp SKU dự kiến bán.
- [ ] `stock >= 0` và `0 <= Min < Max` cho mọi SKU.
- [ ] Tổng tồn sản phẩm bằng tổng tồn SKU.
- [ ] Không có đường dẫn ảnh hỏng.
- [ ] Trang chi tiết hiển thị đúng gallery khi đổi màu.
- [ ] Thêm giỏ hàng gửi đúng `variant_id` và `variant_sku`.
- [ ] Staff điều chỉnh đúng SKU và lịch sử kho được ghi nhận.
- [ ] Bộ lọc bốn trạng thái kho trả đúng kết quả.
- [ ] Không tạo tài khoản, đơn hàng hoặc dữ liệu mẫu ngoài phạm vi được yêu cầu.

## 11. Những lỗi không được chấp nhận

- Dùng tổng tồn sản phẩm để quyết định một màu/kích cỡ còn hàng.
- Gọi mã sản phẩm là SKU cha.
- Tạo SKU nhưng không có màu hoặc kích cỡ tương ứng.
- Dùng chung một ảnh cho mọi màu dù màu sản phẩm khác nhau.
- Tự tạo sản phẩm hoặc đơn hàng ngoài danh sách đã được duyệt.
- Sửa trực tiếp tổng tồn của `Products` nhưng không sửa SKU.
- Lưu trạng thái kho tĩnh thay vì tính từ Stock/Min/Max.
- Xóa vật lý SKU đã từng xuất hiện trong đơn hàng; phải chuyển `is_active = 0`.

Tài liệu này là nguồn quy chuẩn cho mọi lần tạo mới, thay thế hoặc mở rộng catalog Maison Rue.
