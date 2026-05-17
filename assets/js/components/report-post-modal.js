/**
 * @file report-post-modal.js
 * @module components/report-post-modal
 *
 * Module độc lập quản lý toàn bộ vòng đời của modal "Báo cáo bài đăng".
 *
 * ── Thiết kế ────────────────────────────────────────────────────────────────
 *  - Xuất một singleton object `ReportPostModal` với interface công khai:
 *      • ReportPostModal.open(postId)  — mở modal, được gọi từ post-interactions.js
 *      • ReportPostModal.close()       — đóng modal
 *  - Các method nội bộ:
 *      • injectHTML()    — inject markup vào <body> một lần duy nhất (idempotent)
 *      • bindEvents()    — gắn listener bên trong modal một lần duy nhất (idempotent)
 *      • _loadReasons()  — fetch lý do từ API, có cache session
 *
 * ── Tích hợp với hệ thống hiện tại ─────────────────────────────────────────
 *  post-interactions.js xử lý click nút [data-action="report-post"] và gọi:
 *      ReportPostModal.open(postId);
 *
 *  Nếu post-interactions.js vẫn đang dùng logic báo cáo nội bộ cũ, hãy xóa
 *  phần `injectReportModal`, `openReportModal`, `closeReportModal`,
 *  `loadReportReasons` trong đó và thay bằng import + gọi module này.
 *
 * ── Luồng submit ────────────────────────────────────────────────────────────
 *  1. User chọn radio "lý do" → bấm "Gửi"
 *  2. Validate: phải có lý do + postId
 *  3. Gọi postApi.reportPost(postId, reasonCode) — API thật
 *  4. Thành công → toast success → tự đóng modal
 *  5. Thất bại   → hiện thông báo lỗi inline (không đóng modal)
 */

"use strict";

import { postApi } from "../api/post-api.js";

// ─── Hằng ID / Class ─────────────────────────────────────────────────────────
const MODAL_ID         = "report-post-modal";
const FORM_ID          = "report-post-form";
const CLOSE_BTN_ID     = "report-post-close";
const CANCEL_BTN_ID    = "report-post-cancel";
const SUBMIT_BTN_ID    = "report-post-submit";
const FEEDBACK_ID      = "report-post-feedback";
const REASONS_ID       = "report-reasons-container";
const ACTIVE_POST_ATTR = "data-active-post-id";

// ─── HTML Template ───────────────────────────────────────────────────────────
const MODAL_HTML = /* html */ `
<div
  id="${MODAL_ID}"
  class="report-post-modal is-hidden"
  role="dialog"
  aria-modal="true"
  aria-labelledby="report-post-title"
  aria-hidden="true"
>
  <div class="report-post-dialog">
    <header class="report-post-header">
      <h2 id="report-post-title" class="report-post-title">Báo cáo bài đăng</h2>
      <button id="${CLOSE_BTN_ID}" class="report-post-close" type="button" aria-label="Đóng modal báo cáo">
        <i class="bx bx-x" aria-hidden="true"></i>
      </button>
    </header>

    <form id="${FORM_ID}" class="report-post-form" novalidate>
      <p class="report-post-instruction">Vui lòng chọn lý do báo cáo:</p>

      <!-- Lý do báo cáo được inject động bởi _loadReasons() -->
      <div id="${REASONS_ID}" class="report-reasons-list" role="radiogroup" aria-label="Lý do báo cáo"></div>

      <!-- Thông báo lỗi / thành công inline -->
      <p
        id="${FEEDBACK_ID}"
        class="report-post-feedback is-hidden"
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
      ></p>

      <div class="report-post-actions">
        <button id="${CANCEL_BTN_ID}" class="btn btn--ghost" type="button">Hủy</button>
        <button id="${SUBMIT_BTN_ID}" class="btn btn--primary" type="submit">Gửi</button>
      </div>
    </form>
  </div>
</div>
`;

// ─── Helpers nội bộ ──────────────────────────────────────────────────────────

/** Escape HTML để tránh XSS khi nhúng text vào attribute hoặc innerHTML. */
const _esc = (value) =>
	String(value ?? "")
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");

/** Chuẩn hóa string: trim + trả "" nếu rỗng / không phải string. */
const _str = (value) => {
	if (typeof value !== "string") return "";
	const t = value.trim();
	return t.length > 0 ? t : "";
};

// ─── Singleton Object ─────────────────────────────────────────────────────────

/**
 * Singleton quản lý modal báo cáo bài đăng.
 * Giao diện công khai: `open(postId)` và `close()`.
 */
export const ReportPostModal = (() => {
	// ── State nội bộ ──────────────────────────────────────────────────────────
	let _eventsAreBound = false;          // Guard: bindEvents() chỉ chạy 1 lần
	let _reasonsCache   = null;           // Cache session: tránh gọi lại API
	let _isSubmitting   = false;          // Khóa chống double-submit

	// ── Lấy phần tử DOM (lazy — sau khi inject) ───────────────────────────────
	const _el = (id) => document.getElementById(id);

	// ── injectHTML ─────────────────────────────────────────────────────────────
	/**
	 * Chèn HTML của modal vào cuối <body> nếu chưa tồn tại.
	 * Idempotent: gọi nhiều lần cũng chỉ inject một lần.
	 */
	const injectHTML = () => {
		if (_el(MODAL_ID)) return; // Đã có trên DOM — bỏ qua
		document.body.insertAdjacentHTML("beforeend", MODAL_HTML);
	};

	// ── Feedback helpers ───────────────────────────────────────────────────────
	const _showFeedback = (message, isError = true) => {
		const el = _el(FEEDBACK_ID);
		if (!el) return;
		el.textContent = message;
		el.style.color = isError ? "#dc2626" : "#15803d";
		el.classList.remove("is-hidden");
	};

	const _clearFeedback = () => {
		const el = _el(FEEDBACK_ID);
		if (!el) return;
		el.textContent = "";
		el.style.color = "";
		el.classList.add("is-hidden");
	};

	// ── Toast notification ─────────────────────────────────────────────────────
	/**
	 * Hiển thị toast nhỏ ở góc màn hình.
	 * Dùng chung container `.toast-container` với phần còn lại của app.
	 * @param {string} message
	 * @param {'success'|'error'|'info'} variant
	 */
	const _showToast = (message, variant = "info") => {
		const CONTAINER_ID = "report-modal-toast-container";
		let container = document.getElementById(CONTAINER_ID);
		if (!container) {
			container = document.createElement("div");
			container.id        = CONTAINER_ID;
			container.className = "toast-container";
			document.body.appendChild(container);
		}

		const toast = document.createElement("div");
		toast.className = `toast toast--${variant}`;
		toast.setAttribute("role", "status");
		toast.setAttribute("aria-live", "polite");
		toast.textContent = message;
		container.appendChild(toast);

		// Trigger reflow để CSS transition hoạt động
		void toast.offsetWidth;
		toast.classList.add("toast--visible");

		window.setTimeout(() => {
			toast.classList.remove("toast--visible");
			toast.addEventListener("transitionend", () => toast.remove(), { once: true });
		}, 3500);
	};

	// ── Lý do báo cáo ─────────────────────────────────────────────────────────
	/**
	 * Render danh sách radio button từ mảng reasons.
	 * @param {HTMLElement} container
	 * @param {{ code: string, reason: string }[]} reasons
	 */
	const _renderReasons = (container, reasons) => {
		if (!container) return;
		const html = reasons
			.map((item) => {
				const code   = _esc(_str(item?.code));
				const label  = _esc(_str(item?.reason));
				if (!code || !label) return "";
				return `
					<label class="report-reason-option">
						<input type="radio" name="report-reason" value="${code}">
						<span>${label}</span>
					</label>`;
			})
			.join("");

		container.innerHTML =
			html ||
			`<p class="report-reasons-error">Không có lý do nào được tải.</p>`;
	};

	/**
	 * Tải lý do từ API (với cache session). Hiển thị spinner trong khi chờ.
	 */
	const _loadReasons = async () => {
		const container = _el(REASONS_ID);
		if (!container) return;

		// Dùng cache nếu đã có — không gọi lại API
		if (Array.isArray(_reasonsCache) && _reasonsCache.length > 0) {
			_renderReasons(container, _reasonsCache);
			return;
		}

		// Spinner loading
		container.innerHTML = `
			<div class="report-reasons-loading" aria-busy="true" aria-live="polite">
				<span class="report-reasons-spinner" aria-hidden="true"></span>
				<span>Đang tải lý do...</span>
			</div>`;

		try {
			const response = await postApi.getReportReasons();
			const reasons  = Array.isArray(response?.data?.reportReasons)
				? response.data.reportReasons
				: [];

			_reasonsCache = reasons; // Lưu cache
			_renderReasons(container, reasons);
		} catch (err) {
			console.error("[ReportPostModal] _loadReasons error:", err);
			container.innerHTML = `
				<p class="report-reasons-error">
					Đã có lỗi khi tải danh sách lý do. Vui lòng thử lại.
				</p>`;
		}
	};

	// ── Submit handler ─────────────────────────────────────────────────────────
	const _handleSubmit = async (event) => {
		event.preventDefault();

		if (_isSubmitting) return; // Chống double-submit

		const modal       = _el(MODAL_ID);
		const form        = _el(FORM_ID);
		const submitBtn   = _el(SUBMIT_BTN_ID);
		const postId      = _str(modal?.getAttribute(ACTIVE_POST_ATTR));
		const reasonInput = form?.querySelector('input[name="report-reason"]:checked');
		const reasonCode  = _str(reasonInput?.value);

		// ── Validate ──
		if (!postId) {
			_showFeedback("Không xác định được bài đăng cần báo cáo.");
			return;
		}
		if (!reasonCode) {
			_showFeedback("Vui lòng chọn lý do báo cáo.");
			return;
		}

		// ── Submit → API thật ──
		_isSubmitting = true;
		_clearFeedback();
		if (submitBtn) submitBtn.disabled = true;

		// ── Stub console.log theo đặc tả ──
		console.log("[ReportPostModal] Gửi báo cáo:", { postId, reasonCode });

		try {
			const response   = await postApi.reportPost(postId, reasonCode);
			const successMsg = _str(response?.message) || "Báo cáo thành công!";

			_showToast(successMsg, "success");
			window.setTimeout(() => close(), 500); // Đóng modal sau 500 ms
		} catch (error) {
			console.error("[ReportPostModal] reportPost error:", error);

			// Ưu tiên message từ API response; fallback sang generic
			const errMsg =
				_str(error?.data?.message) ||
				_str(error?.message)       ||
				"Không thể gửi báo cáo. Vui lòng thử lại.";

			_showFeedback(errMsg, true);
		} finally {
			_isSubmitting = false;
			if (submitBtn) submitBtn.disabled = false;
		}
	};

	// ── bindEvents ─────────────────────────────────────────────────────────────
	/**
	 * Gắn tất cả listener bên trong modal.
	 * Guard `_eventsAreBound` đảm bảo chỉ gắn đúng 1 lần, dù gọi nhiều lần.
	 */
	const bindEvents = () => {
		if (_eventsAreBound) return;
		_eventsAreBound = true;

		// Nút X (close) và nút Hủy
		_el(CLOSE_BTN_ID)?.addEventListener("click", () => close());
		_el(CANCEL_BTN_ID)?.addEventListener("click", () => close());

		// Click backdrop (overlay bên ngoài dialog) → đóng modal
		_el(MODAL_ID)?.addEventListener("click", (event) => {
			if (event.target === _el(MODAL_ID)) close();
		});

		// Phím Escape → đóng modal
		document.addEventListener("keydown", (event) => {
			if (event.key === "Escape" && !_el(MODAL_ID)?.classList.contains("is-hidden")) {
				close();
			}
		});

		// Submit form
		_el(FORM_ID)?.addEventListener("submit", _handleSubmit);
	};

	// ── open ───────────────────────────────────────────────────────────────────
	/**
	 * Mở modal báo cáo cho bài đăng có ID cho trước.
	 * Được gọi từ bên ngoài (post-interactions.js).
	 *
	 * @param {string} postId - ID bài đăng cần báo cáo.
	 */
	const open = (postId) => {
		const safePostId = _str(postId);
		if (!safePostId) {
			console.warn("[ReportPostModal] open() bị gọi thiếu postId hợp lệ.");
			return;
		}

		// 1. Đảm bảo HTML đã có trên DOM
		injectHTML();

		// 2. Gắn events (idempotent — chỉ thực sự chạy lần đầu)
		bindEvents();

		const modal = _el(MODAL_ID);
		const form  = _el(FORM_ID);
		if (!modal || !form) return;

		// 3. Lưu postId vào data-attribute của modal — nguồn truth cho _handleSubmit
		modal.setAttribute(ACTIVE_POST_ATTR, safePostId);

		// 4. Reset form & xóa feedback cũ
		form.reset();
		_clearFeedback();
		if (_el(SUBMIT_BTN_ID)) _el(SUBMIT_BTN_ID).disabled = false;
		_isSubmitting = false;

		// 5. Tải lý do báo cáo (có cache — gọi API tối đa 1 lần/session)
		void _loadReasons();

		// 6. Hiển thị modal
		modal.classList.remove("is-hidden");
		modal.setAttribute("aria-hidden", "false");
		document.body.style.overflow = "hidden";

		// 7. Focus vào nút đóng cho accessibility
		window.requestAnimationFrame(() => {
			_el(CLOSE_BTN_ID)?.focus();
		});
	};

	// ── close ──────────────────────────────────────────────────────────────────
	/**
	 * Đóng và reset modal về trạng thái ban đầu.
	 * Có thể gọi từ bên ngoài hoặc từ các handler nội bộ.
	 */
	const close = () => {
		const modal = _el(MODAL_ID);
		if (!modal) return;

		modal.classList.add("is-hidden");
		modal.setAttribute("aria-hidden", "true");
		modal.removeAttribute(ACTIVE_POST_ATTR);
		document.body.style.overflow = "";

		_clearFeedback();
		_isSubmitting = false;
	};

	// ── Public interface ───────────────────────────────────────────────────────
	return Object.freeze({ injectHTML, bindEvents, open, close });
})();
