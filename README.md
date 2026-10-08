# Bảng theo dõi view FUJI · KAITASHI

Landing page miễn phí, chạy lâu dài trên **GitHub Pages** + **GitHub Actions** (không cần máy chủ).

- 2 khu vực **FUJI** và **KAITASHI**; mỗi khu vực có bảng `STT | Tên video | Link video | Số view lẻ | Tổng view` và biểu đồ tăng trưởng bên phải.
- Video trùng giữa YouTube / TikTok / Facebook được ghép thành 1 dòng (so khớp theo tiêu đề đã bỏ hashtag).
- Tự cập nhật mỗi 30 phút; trang tự làm mới mỗi 60 giây.

## Cài đặt (làm 1 lần, ~5 phút)

1. Tạo repo **public** mới trên GitHub (VD `view-tracker`) và tải toàn bộ thư mục này lên (nhánh `main`).
2. Vào **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Vào tab **Actions → "Cập nhật view…" → Run workflow** để chạy lần đầu.
4. Link trang: `https://<tên-github>.github.io/<tên-repo>/`

## Tuỳ chọn để số liệu đầy đủ hơn

| Secret (Settings → Secrets → Actions) | Tác dụng |
|---|---|
| `YT_API_KEY` | Khoá YouTube Data API v3 (miễn phí) → số view YouTube chính xác tuyệt đối (mặc định bị làm tròn, VD 1,2K). |
| `FB_TOKEN_FUJI`, `FB_TOKEN_KAITASHI` | Page Access Token của 2 Fanpage (cần là admin) → lấy ĐỦ toàn bộ Reels. Không có token thì chỉ đọc được 10 reel mới nhất (Facebook chặn khách chưa đăng nhập). |

## Đổi kênh / thêm kênh
Sửa `config.json`.

## Giới hạn cần biết
- "Thời gian thực" = cập nhật mỗi ~30 phút (GitHub có thể trễ vài phút). TikTok/Facebook không có API công khai realtime.
- TikTok/Facebook đôi khi chặn IP máy chủ; khi đó trang giữ số liệu lần trước và hiện cảnh báo vàng.
