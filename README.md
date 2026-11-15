# FindBox App — Smart Lost & Found Locker Platform

> Hệ thống ứng dụng web đa nền tảng (PWA) và Backend API quản lý tủ thông minh lưu trữ & tìm kiếm đồ thất lạc, tích hợp AI Vision Gemini và IoT ESP32.

---

## Tính năng nổi bật

### Dành cho Người dùng (User)
- **Tìm kiếm đồ thất lạc:** Tra cứu nhanh đồ vật nhặt được theo từ khóa, danh mục, địa điểm nhặt được.
- **Gửi báo cáo mất đồ:** Đăng tin báo mất kèm mô tả chi tiết, hình ảnh chụp và thời gian/địa điểm.
- **Gửi đồ nhặt được vào tủ thông minh:** Tự tiếp nhận đồ vào các ngăn tủ trống của FindBox, nhận mã biên nhận (Tracking Code).
- **Tự động đối chiếu bằng AI (Google Gemini Vision):** Hệ thống AI tự động phân tích hình ảnh và đặc điểm mô tả để so khớp đơn báo mất với các món đồ trong kho.
- **Nhận lại đồ qua mã OTP:** Khi yêu cầu nhận đồ được duyệt, người dùng nhận mã OTP 6 số để mở ngăn tủ trực tiếp tại bàn phím hoặc ứng dụng.
- **Hỗ trợ PWA (Progressive Web App):** Cài đặt mượt mà trên iPhone (iOS Safari) và Android như một ứng dụng native, tương thích chuẩn tai thỏ Notch và thanh Home bar.

### Dành cho Quản trị viên (Admin)
- **Bảng điều khiển Tổng quan (Dashboard):** Giám sát trạng thái thiết bị ESP32 (Online/Offline), số ngăn đang chứa đồ, số yêu cầu chờ duyệt.
- **Quản lý Người dùng & Phân quyền:**
  - Danh sách người dùng kèm bộ lọc vai trò (`Admin`/`User`) và trạng thái (`Hoạt động`/`Đã khóa`).
  - Thêm tài khoản mới, phân quyền Admin, đặt lại mật khẩu.
  - Khóa/Mở khóa tức thì và xóa tài khoản an toàn (bảo vệ không tự xóa hoặc hạ quyền chính mình).
- **Kiểm duyệt Yêu cầu nhận đồ (Claims):** So sánh bằng chứng sở hữu của người dùng, duyệt cấp mã OTP hoặc từ chối kèm lý do.
- **Quản lý Đồ lưu trữ trong kho:** Xem chi tiết hình ảnh, mã tra cứu, vị trí ngăn tủ đang lưu trữ, xuất kho đồ đã trao trả.
- **Điều khiển & Giám sát Tủ IoT (L-001):**
  - Mở ngăn tủ khẩn cấp từ xa qua Internet.
  - Giám sát trạng thái cảm biến cửa (Đang Mở / Đã Đóng) và tình trạng ngăn (Trống / Có đồ / Bảo trì) theo thời gian thực.
  - Cấu hình chân GPIO động (Servo, Cảm biến) cho từng ngăn tủ trực tiếp từ giao diện web.

---

## Kiến trúc hệ thống

```text
FindBox Platform
├── backend/                       # RESTful API Server (Node.js + Express + TypeScript)
│   ├── src/
│   │   ├── migrations/            # Khởi tạo bảng PostgreSQL & dữ liệu mẫu
│   │   ├── middleware/            # Xác thực JWT & phân quyền RBAC
│   │   ├── routes/                # Endpoints (auth, users, found_items, claims, device, uploads)
│   │   ├── services/
│   │   │   ├── lost-item-matching.ts  # Dịch vụ đối chiếu AI Gemini + Sharp nén ảnh
│   │   │   └── object-storage.ts      # Kết nối S3 / MinIO lưu trữ ảnh
│   │   └── utils/                 # Ghi log audit, thông báo, hardware config
│   └── test/                      # Unit tests (Hardware config, AI matching rules)
│
└── frontend/                      # Client PWA (React 18 + Vite + Ant Design)
    ├── src/
    │   ├── api/                   # Gọi API backend & kiểu dữ liệu TypeScript
    │   ├── components/            # Modal OTP, Navbar, Drawer, AuthModal
    │   ├── context/               # AuthContext lưu token & session
    │   └── views/                 # Giao diện User & Admin views
    └── public/                    # Manifest PWA, service worker, icons
```

---

## Hướng dẫn Cài đặt & Khởi chạy

### 1. Yêu cầu môi trường
- **Node.js:** v18.0.0 trở lên
- **PostgreSQL:** v14 trở lên (hoặc Neon Database)
- **MinIO / AWS S3:** Dịch vụ lưu trữ tệp hình ảnh (tùy chọn)

---

### 2. Cấu hình & Chạy Backend

1. Di chuyển vào thư mục backend:
   ```bash
   cd HeNhungApp/backend
   npm install
   ```

2. Tạo file `.env` dựa theo mẫu `.env.example`:
   ```ini
   PORT=3000
   DB_HOST=localhost
   DB_PORT=5432
   DB_NAME=smart_locker
   DB_USER=postgres
   DB_PASSWORD=your_password
   JWT_SECRET=your_jwt_secret_key

   # Google Gemini AI API
   GEMINI_API_KEY=AIzaSy...
   GEMINI_MODEL=gemini-1.5-flash
   GEMINI_MATCH_THRESHOLD=0.78

   # Object Storage (MinIO / S3 / Neon)
   AWS_ENDPOINT_URL_S3=http://localhost:9000
   AWS_ACCESS_KEY_ID=minioadmin
   AWS_ACCESS_KEY_SECRET=minioadmin
   NEON_STORAGE_BUCKET=findbox-images
   ```

3. Khởi chạy server:
   - **Chế độ phát triển (Watch mode):**
     ```bash
     npm run dev
     ```
   - **Chạy kiểm thử (Unit Tests):**
     ```bash
     npm test
     ```
   - **Build & Chạy Production:**
     ```bash
     npm run build
     npm start
     ```

> **Tài khoản mặc định được tạo sẵn sau khi chạy migration:**
> - **Quản trị viên (Admin):** `admin@findbox.vn` / `Admin@123456`
> - **Người dùng mẫu (User):** `user@findbox.vn` / `User@123456`

---

### 3. Cấu hình & Chạy Frontend (PWA)

1. Di chuyển vào thư mục frontend:
   ```bash
   cd HeNhungApp/frontend
   npm install
   ```

2. Tạo file `.env.local` nếu cần trỏ đến API backend tùy chỉnh:
   ```ini
   VITE_API_URL=http://localhost:3000/api
   ```
   *(Mặc định frontend tự động fallback kết nối tới backend localhost hoặc cấu hình qua modal Kết nối Máy chủ)*.

3. Chạy môi trường phát triển:
   ```bash
   npm run dev
   ```
   Mở trình duyệt tại: `http://localhost:5173`

4. Build bản Production:
   ```bash
   npm run build
   ```

---

## Danh sách API chính

| Phương thức | Endpoint | Mô tả | Quyền hạn |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/login` | Đăng nhập hệ thống & nhận JWT | Công khai |
| `POST` | `/api/auth/register` | Đăng ký tài khoản người dùng | Công khai |
| `GET` | `/api/users` | Lấy danh sách tài khoản & bộ lọc | Admin |
| `POST` | `/api/users` | Tạo người dùng mới & phân quyền | Admin |
| `PUT` | `/api/users/:id` | Cập nhật thông tin/vai trò/mật khẩu | Admin |
| `DELETE` | `/api/users/:id` | Xóa tài khoản vĩnh viễn | Admin |
| `GET` | `/api/found-items` | Tra cứu danh sách đồ thất lạc | Công khai / User |
| `POST` | `/api/found-items` | Gửi đồ nhặt được vào tủ FindBox | Công khai / User |
| `POST` | `/api/claims` | Gửi yêu cầu nhận lại đồ thất lạc | User |
| `POST` | `/api/device/heartbeat` | ESP32 gửi nhịp tim & trạng thái cửa | Thiết bị IoT |
| `GET` | `/api/device/commands/next` | ESP32 polling nhận lệnh mở tủ | Thiết bị IoT |
| `POST` | `/api/device/verify-otp` | ESP32 xác thực mã OTP mở ngăn | Thiết bị IoT |
