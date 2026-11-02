# Maison Rue — Luxury Fashion E-Commerce (3-Portal RBAC & MS SQL Server Backend)

Hệ thống thương mại điện tử thời trang cao cấp Maison Rue với kiến trúc **3 Cổng riêng biệt (Three Distinct Portals)**: **CUSTOMER PORTAL**, **STAFF PORTAL**, và **ADMIN PORTAL**, kết nối tập trung vào một cơ sở dữ liệu **Microsoft SQL Server (`MaisonRueDB`)** thông qua backend bảo mật **Node.js / Express**.

---

## 1. Kiến Trúc 3 Cổng Riêng Biệt (Three Distinct Portals)

Maison Rue được thiết kế với sự phân lập hoàn toàn về giao diện, tuyến đường, thẩm quyền đăng nhập và cơ chế bảo vệ:

| Thuộc tính | Customer Portal | Staff Portal | Admin Portal |
| :--- | :--- | :--- | :--- |
| **Đăng nhập** | `/login` | `/staff/login` | `/admin/login` |
| **Đích đến sau đăng nhập** | `/account/orders` | `/staff` | `/admin` |
| **Layout** | Luxury Storefront (Header, Banner, Chatbot, Footer) | Operational Workspace (Sidebar, Bảng kiểm soát đơn, Kho) | Executive Workspace (Sidebar, Báo cáo tài chính, Nhân sự) |
| **Đăng ký tài khoản** | **Công khai** (Tab Đăng ký tại `/login`) | **Đóng** (Chỉ Admin tạo tài khoản nhân viên) | **Đóng** (Không đăng ký công khai) |
| **Chức năng chính** | Xem catalog, giỏ hàng, đặt hàng, theo dõi đơn, hủy đơn | Xử lý quy trình đơn hàng 5 bước, quản lý tồn kho, nhập/xuất kho | Báo cáo doanh thu đã thu (Paid), KPIs thực tế, quản lý tài khoản Staff |

---

## 2. Tài Khoản Thử Nghiệm Phát Triển (Development Accounts)

Các mật khẩu được băm an toàn bằng **bcrypt** (10 rounds) và lưu trữ trong cơ sở dữ liệu Microsoft SQL Server:

| Vai trò | Email đăng nhập | Mật khẩu | Cổng đăng nhập hợp lệ | Thẩm quyền & Hành vi |
| :--- | :--- | :--- | :--- | :--- |
| **Admin** | `admin@maisonrue.com` | `admin123` | `/admin/login` | Truy cập `/admin`, `/admin/employees`, `/admin/reports`, `/admin/orders`. Bị chặn nếu đăng nhập ở `/login` hoặc `/staff/login`. |
| **Staff** | `staff@maisonrue.com` | `staff123` | `/staff/login` | Truy cập `/staff`, `/staff/orders`, `/staff/inventory`. Bị chặn nếu đăng nhập ở `/admin/login` hoặc `/login`. |
| **Staff 2** | `staff2@maisonrue.com` | `staff123` | `/staff/login` | Nhân viên vận hành số 2 kiểm tra đồng bộ phiên làm việc. |
| **Staff (Khóa)** | `staff.inactive@maisonrue.com` | `staff123` | `/staff/login` | Bị backend từ chối đăng nhập với thông báo *"Tài khoản đã bị vô hiệu hóa"*. |
| **Customer** | `customer@gmail.com` | `customer123` | `/login` | Mua sắm, thanh toán, quản lý đơn cá nhân. Bị chặn nếu truy cập Staff hoặc Admin. |

> **Nguyên tắc từ chối đăng nhập đa cổng (Strict Role Rejection):**
> Backend xác thực kép cả thông tin đăng nhập và vai trò cổng truy cập. Khách hàng hoặc Nhân viên cố ý đăng nhập qua `/admin/login` sẽ bị backend từ chối ngay lập tức với mã lỗi HTTP 403 Forbidden.

---

## 3. Hướng Dẫn Cài Đặt & Khởi Chạy Dự Án

### Yêu cầu môi trường
- **Node.js** >= 18.0.0
- **Microsoft SQL Server** (Standard, Developer, Enterprise hoặc Express; cổng TCP mặc định thường là 1433)

### Bước 1: Cài đặt thư viện dependencies
```bash
npm install
```

### Bước 2: Cấu hình biến môi trường (`.env`)
Tệp `.env` đã được thiết lập sẵn trong thư mục gốc:
```env
PORT=5000
NODE_ENV=development
CLIENT_ORIGIN=http://localhost:5173
JWT_SECRET=maison_rue_super_secret_jwt_key_2026_luxury_old_money
DB_SERVER=127.0.0.1
DB_PORT=1433
DB_NAME=MaisonRueDB
DB_USER=sa
DB_PASSWORD=YourStrongPassword123!
DB_TRUST_SERVER_CERTIFICATE=true
```

### Bước 3: Khởi tạo CSDL & Nạp tài khoản Seed (Chạy 1 lần ban đầu)
```bash
# Thực thi DDL Schema tạo 7 bảng quan hệ trên SQL Server
npm run db:migrate

# Nạp dữ liệu Seed mẫu (Admin, Staff, Customer, Sản phẩm, Đơn mẫu)
npm run db:seed
```

### Bước 4: Kiểm thử toàn diện hệ thống (38 test cases tự động)
```bash
npm test
```

### Bước 5: Khởi chạy Backend và Frontend
Lệnh phát triển khởi chạy cả backend API (port 5000) và frontend React/Vite (port 5173):
```bash
npm run dev
```

Để chỉ khởi chạy backend API, dùng `npm run server` trong một cửa sổ Terminal riêng.

Mở trình duyệt truy cập:
- **Customer Storefront:** `http://localhost:5173`
- **Customer Login:** `http://localhost:5173/login`
- **Staff Portal Login:** `http://localhost:5173/staff/login`
- **Admin Portal Login:** `http://localhost:5173/admin/login`

### Các lệnh bổ sung cho Database:
```bash
# Thực thi migration DDL tạo bảng SQL Server
npm run db:migrate

# Nạp dữ liệu tài khoản và sản phẩm mẫu vào SQL Server
npm run db:seed
```

---

## 4. Cơ Sở Dữ Liệu Microsoft SQL Server (`MaisonRueDB`)

Schema DDL được thiết kế chuẩn mực quan hệ (3NF) trong [`server/db/schema.sql`](./server/db/schema.sql):

```mermaid
erDiagram
    Users ||--o{ Orders : "places"
    Users ||--o{ InventoryMovements : "performs"
    Users ||--o{ OrderStatusHistory : "updates"
    Orders ||--|{ OrderItems : "contains"
    Orders ||--|| Payments : "has"
    Orders ||--o{ OrderStatusHistory : "logs"
    Products ||--o{ OrderItems : "ordered_in"
    Products ||--o{ InventoryMovements : "tracked_by"

    Users {
        nvarchar id PK
        nvarchar name
        nvarchar email UK
        nvarchar password_hash
        nvarchar role "customer | staff | admin"
        nvarchar phone
        bit is_active
        datetime created_at
    }

    Products {
        int id PK
        nvarchar name
        nvarchar category "men | women | accessories"
        decimal price
        int stock
        nvarchar image_url
        bit is_active
    }

    Orders {
        nvarchar id PK
        nvarchar customer_id FK
        nvarchar customer_name
        nvarchar customer_email
        nvarchar customer_phone
        nvarchar shipping_address
        decimal total_amount
        nvarchar order_status "pending | confirmed | processing | shipping | delivered | cancelled"
        bit stock_deducted
        datetime created_at
    }

    Payments {
        int id PK
        nvarchar order_id FK
        nvarchar payment_method "cod | bank_transfer"
        decimal amount
        nvarchar payment_status "unpaid | pending_verification | paid | refunded"
        datetime verified_at
    }
```

### Tính toàn vẹn nghiệp vụ (Business Rules & ACID Transactions):
1. **Checkout & Stock Deduction:** Khi khách hàng đặt đơn, backend chạy **SQL Transaction**: kiểm tra số lượng tồn kho từng mặt hàng, trừ kho, tạo bản ghi `Orders`, `OrderItems`, `Payments` (`payment_status = 'unpaid'`), và ghi nhật ký vào `InventoryMovements`.
2. **Order Cancellation & Stock Restoration:** Khi đơn bị hủy, SQL Transaction hoàn trả tồn kho về trạng thái ban đầu, cập nhật `Orders.stock_deducted = 0`, ghi nhật ký hoàn kho `order_cancellation_restore`, và cập nhật `Payments.payment_status = 'refunded'`.
3. **Revenue Accounting (Doanh thu thực tế):** Chỉ các đơn có `Payments.payment_status = 'paid'` (được kích hoạt khi đơn hàng chuyển sang `delivered`) mới được tính vào doanh thu thực thu của doanh nghiệp. Các đơn đang luân chuyển được tính vào mục *Doanh thu đang xử lý*. Không có tình trạng tính trùng lặp doanh thu (Anti Double-Counting).

---

## 5. Danh Mục Tuyến Đường & Phân Quyền (Route Hierarchy)

### Cổng Khách Hàng (Customer Portal)
- `/` — Trang chủ thương hiệu thời trang Maison Rue
- `/men`, `/women`, `/accessories` — Danh mục sản phẩm
- `/product/:id` — Chi tiết sản phẩm & tình trạng tồn kho thời gian thực
- `/cart` — Giỏ hàng
- `/checkout` — Thanh toán & tạo đơn hàng
- `/login` — Đăng nhập & Đăng ký tài khoản Khách hàng
- `/account/orders` — **[Bảo vệ - Customer]** Xem lịch sử đơn, tiến trình 5 bước, chi tiết thanh toán, hủy đơn

### Cổng Nhân Viên (Staff Portal Workspace)
- `/staff/login` — Trang đăng nhập bảo mật dành riêng cho Staff
- `/staff` — **[Bảo vệ - Staff]** Dashboard vận hành: đơn chờ duyệt, cảnh báo kho hết hàng/sắp hết hàng
- `/staff/orders` — **[Bảo vệ - Staff]** Xử lý quy trình đơn hàng: Pending ➔ Confirmed ➔ Processing ➔ Shipping ➔ Delivered
- `/staff/inventory` — **[Bảo vệ - Staff]** Quản lý kho: điều chỉnh số lượng tồn, xem lịch sử biến động nhập/xuất kho (Inventory Movements)

### Cổng Quản Trị (Admin Portal Workspace)
- `/admin/login` — Trang đăng nhập bảo mật dành riêng cho Admin
- `/admin` — **[Bảo vệ - Admin]** Dashboard điều hành: Doanh thu thực nhận, AOV, phân bổ đơn hàng, cơ cấu doanh số danh mục
- `/admin/employees` — **[Bảo vệ - Admin]** Quản lý nhân viên: xem danh sách, tạo tài khoản Staff mới, cập nhật thông tin, kích hoạt/vô hiệu hóa tài khoản nhân sự
- `/admin/reports` — **[Bảo vệ - Admin]** Báo cáo tài chính & doanh thu đối soát: lọc theo kỳ, xuất file báo cáo kiểm toán CSV
- `/admin/orders` — **[Bảo vệ - Admin]** Giám sát đơn hàng & tình trạng thanh toán toàn diện

### Tuyến đường hệ thống
- `/access-denied` — Trang từ chối quyền truy cập với giao diện sang trọng chuẩn Maison Rue và nút chuyển hướng về cổng tương ứng.

---

## 6. Danh Mục API Backend (RESTful Endpoints)

| Phương thức | Tuyến đường API | Thẩm quyền | Mô tả chức năng |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/customer/login` | Public | Đăng nhập cổng Khách hàng, cấp HttpOnly Cookie |
| `POST` | `/api/auth/staff/login` | Public | Đăng nhập cổng Nhân viên, kiểm tra `is_active` |
| `POST` | `/api/auth/admin/login` | Public | Đăng nhập cổng Quản trị viên |
| `POST` | `/api/auth/register` | Public | Đăng ký tài khoản khách hàng mới |
| `POST` | `/api/auth/logout` | Authenticated | Xóa cookie phiên làm việc |
| `GET` | `/api/auth/me` | Authenticated | Lấy thông tin user hiện tại từ token cookie |
| `GET` | `/api/products` | Public | Lấy danh mục sản phẩm & tồn kho hiện hành |
| `PATCH` | `/api/products/:id/stock` | Staff, Admin | Cập nhật số lượng tồn kho & ghi lịch sử movement |
| `GET` | `/api/products/inventory/movements`| Staff, Admin | Xem lịch sử biến động nhập/xuất kho |
| `GET` | `/api/orders` | Authenticated | Lấy danh sách đơn hàng (Customer xem đơn của mình, Staff/Admin xem toàn bộ) |
| `POST` | `/api/orders` | Authenticated / Public | Tạo đơn hàng mới bằng SQL Transaction |
| `PATCH` | `/api/orders/:id/status` | Staff, Admin | Chuyển đổi trạng thái đơn hàng theo workflow hợp lệ |
| `POST` | `/api/orders/:id/cancel` | Customer, Staff | Hủy đơn hàng và tự động hoàn trả tồn kho |
| `GET` | `/api/admin/employees` | Admin | Lấy danh sách tài khoản nhân viên Staff |
| `POST` | `/api/admin/employees` | Admin | Tạo mới tài khoản nhân viên Staff |
| `PUT` | `/api/admin/employees/:id` | Admin | Cập nhật thông tin nhân viên Staff |
| `PATCH` | `/api/admin/employees/:id/status` | Admin | Bật/tắt trạng thái hoạt động của nhân viên |
| `GET` | `/api/admin/reports/revenue` | Admin | Báo cáo doanh thu thực nhận dựa trên `payment_status = 'paid'` |
| `GET` | `/api/health` | Public | Kiểm tra trạng thái hoạt động backend & kết nối DB |

---

## 7. Giữ Gìn Bản Sắc Thương Hiệu (Brand Identity)
- Màu sắc chủ đạo: Nền kem `#F8F5F0`, chữ nâu cà phê đậm `#2B211C`, điểm nhấn vàng kim `#B89B5E`.
- Typography: Tiêu đề Cormorant Garamond cổ điển sang trọng kết hợp thân bài Inter hiện đại sắc nét.
- Giữ nguyên toàn bộ 9 sản phẩm catalog, bộ lọc danh mục, trợ lý thời trang Rue (AI Chatbot), và luồng EmailJS.
