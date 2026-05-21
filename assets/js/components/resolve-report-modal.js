/**
 * @file resolve-report-modal.js
 * @module components/resolve-report-modal
 *
 * Modal "Xử lý vi phạm" dành cho Admin/Moderator.
 *
 * ── Cách dùng ──────────────────────────────────────────────────────────────────
 *   import { ResolveReportModal } from './resolve-report-modal.js';
 *
 *   ResolveReportModal.open({
 *     postId: '018e9...',
 *     postReasonList: [{ reasonCode: 'SCAM', count: 5 }],
 *     allReasons: [{ code: 'SCAM', reason: 'Lừa đảo' }, ...],
 *     onSuccess: (postId) => { /* xóa card khỏi list *\/ }
 *   });
 *
 * ── Thiết kế ───────────────────────────────────────────────────────────────────
 *  - Singleton, inject HTML vào <body> đúng một lần (idempotent).
 *  - open() nhận postId, postReasonList, allReasons và tự:
 *      • Render radio buttons từ allReasons.
 *      • Tự động checked lý do có count cao nhất trong postReasonList.
 *  - Khi submit, gọi API POST /api/admin/reports/posts/{postId}/resolve
 *    với action: "APPROVED", reasonCode, note.
 *  - onSuccess callback được gọi sau khi API thành công.
 */

"use strict";

import { postApi } from "../api/post-api.js";

// ─── Hằng ID ─────────────────────────────────────────────────────────────────

const MODAL_ID        = "resolve-report-modal";
const FORM_ID         = "resolve-report-form";
const CLOSE_BTN_ID    = "resolve-report-close";
const CANCEL_BTN_ID   = "resolve-report-cancel";
const SUBMIT_BTN_ID   = "resolve-report-submit";
const FEEDBACK_ID     = "resolve-report-feedback";
const REASONS_ID      = "resolve-report-reasons-container";
const NOTE_ID         = "resolve-report-note";
const ACTIVE_POST_KEY = "data-active-post-id";

// ─── HTML Template ────────────────────────────────────────────────────────────

const _buildHTML = () => /* html */`
<div
  id="${MODAL_ID}"
  class="resolve-report-modal is-hidden"
  role="dialog"
  aria-modal="true"
  aria-labelledby="resolve-report-title"
  aria-hidden="true"
>
  <div class="resolve-report-dialog">
    <!-- Header -->
    <header class="resolve-report-header">
      <h2 id="resolve-report-title">Xử lý vi phạm</h2>
      <button
        id="${CLOSE_BTN_ID}"
        class="resolve-report-close"
        type="button"
        aria-label="Đóng"
      >
        <i class="bx bx-x" aria-hidden="true"></i>
      </button>
    </header>

    <!-- Form body (scrollable) -->
    <form id="${FORM_ID}" class="resolve-report-form" novalidate>

      <!-- Danh sách lý do -->
      <div>
        <p class="resolve-report-section-label">Lý do vi phạm</p>
        <div
          id="${REASONS_ID}"
          class="resolve-report-reasons"
          role="radiogroup"
          aria-label="Chọn lý do vi phạm"
        ></div>
      </div>

      <!-- Ghi chú -->
      <div>
        <p class="resolve-report-section-label">Ghi chú (tuỳ chọn)</p>
        <div class="resolve-report-note-wrap">
          <textarea
            id="${NOTE_ID}"
            class="resolve-report-note"
            name="resolve-note"
            placeholder="Nhập ghi chú cho quyết định xử lý này..."
            rows="3"
          ></textarea>
        </div>
      </div>

      <!-- Thông báo lỗi/thành công inline -->
      <p
        id="${FEEDBACK_ID}"
        class="resolve-report-feedback is-hidden"
        role="alert"
        aria-live="assertive"
      ></p>

    </form>

    <!-- Footer — nút hành động -->
    <footer class="resolve-report-footer">
      <button
        id="${CANCEL_BTN_ID}"
        class="resolve-report-btn resolve-report-btn--cancel"
        type="button"
      >
        <i class="bx bx-x-circle" aria-hidden="true"></i>
        <span>Hủy</span>
      </button>
      <button
        id="${SUBMIT_BTN_ID}"
        class="resolve-report-btn resolve-report-btn--submit"
        type="submit"
        form="${FORM_ID}"
      >
        <i class="bx bx-shield-x" aria-hidden="true"></i>
        <span>Xác nhận ẩn bài</span>
      </button>
    </footer>
  </div>
</div>
`;

// ─── Helpers nội bộ ──────────────────────────────────────────────────────────

/** Escape HTML để tránh XSS. */
const _esc = (value) =>
	String(value ?? "")
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");

/** Chuẩn hóa string. */
const _str = (value) => {
	if (typeof value !== "string") return "";
	const t = value.trim();
	return t.length > 0 ? t : "";
};

// ─── Singleton ───────────────────────────────────────────────────────────────

/**
 * Singleton quản lý modal Xử lý vi phạm.
 * Giao diện công khai: `open(options)` và `close()`.
 */
export const ResolveReportModal = (() => {
	// ── State nội bộ ─────────────────────────────────────────────────────────
	let _eventsAreBound = false;    // Guard: bindEvents() chỉ chạy 1 lần
	let _isSubmitting   = false;    // Chống double-submit
	let _onSuccess      = null;     // Callback sau khi API thành công

	// ── Lấy phần tử DOM ──────────────────────────────────────────────────────
	const _el = (id) => document.getElementById(id);

	// ── injectHTML ────────────────────────────────────────────────────────────
	/** Chèn HTML vào <body> nếu chưa có. Idempotent. */
	const _injectHTML = () => {
		if (_el(MODAL_ID)) return;
		document.body.insertAdjacentHTML("beforeend", _buildHTML());
	};

	// ── Feedback helpers ──────────────────────────────────────────────────────
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

	// ── Render reasons ────────────────────────────────────────────────────────
	/**
	 * Render danh sách radio button từ allReasons.
	 * Tự động checked lý do có count cao nhất trong postReasonList.
	 *
	 * @param {Array<{code: string, reason: string}>} allReasons - Toàn bộ lý do từ API.
	 * @param {Array<{reasonCode: string, count: number}>} postReasonList - Lý do bài này bị báo cáo.
	 */
	const _renderReasons = (allReasons, postReasonList) => {
		const container = _el(REASONS_ID);
		if (!container) return;

		// Tìm reasonCode có count cao nhất để pre-check
		let defaultCode = "";
		if (Array.isArray(postReasonList) && postReasonList.length > 0) {
			const top = postReasonList.reduce(
				(best, item) => (Number(item?.count) > Number(best?.count) ? item : best),
				postReasonList[0]
			);
			defaultCode = _str(top?.reasonCode);
		}

		if (!Array.isArray(allReasons) || allReasons.length === 0) {
			container.innerHTML =
				'<p class="report-reasons-error">Không có lý do nào được tải.</p>';
			return;
		}

		const html = allReasons
			.map((item) => {
				const code    = _esc(_str(item?.code));
				const label   = _esc(_str(item?.reason));
				if (!code || !label) return "";
				const checked = code === _esc(defaultCode) ? " checked" : "";
				return `
				<label class="resolve-reason-option">
					<input type="radio" name="resolve-reason" value="${code}"${checked}>
					<span>${label}</span>
				</label>`;
			})
			.join("");

		container.innerHTML = html || '<p class="report-reasons-error">Không có lý do nào.</p>';
	};

	// ── Submit handler ────────────────────────────────────────────────────────
	const _handleSubmit = async (event) => {
		event.preventDefault();
		if (_isSubmitting) return;

		const modal      = _el(MODAL_ID);
		const form       = _el(FORM_ID);
		const submitBtn  = _el(SUBMIT_BTN_ID);
		const noteInput  = _el(NOTE_ID);

		const postId     = _str(modal?.getAttribute(ACTIVE_POST_KEY));
		const radioInput = form?.querySelector('input[name="resolve-reason"]:checked');
		const reasonCode = _str(radioInput?.value);
		const note       = _str(noteInput?.value);

		// Validate
		if (!postId) {
			_showFeedback("Không xác định được bài đăng cần xử lý.");
			return;
		}
		if (!reasonCode) {
			_showFeedback("Vui lòng chọn lý do vi phạm.");
			return;
		}

		// Chuyển nút sang trạng thái loading
		_isSubmitting = true;
		_clearFeedback();
		if (submitBtn) {
			submitBtn.disabled = true;
			const span = submitBtn.querySelector("span");
			const icon = submitBtn.querySelector("i");
			if (icon)  icon.className = "";
			if (span)  span.textContent = "Đang xử lý...";
			submitBtn.insertAdjacentHTML(
				"afterbegin",
				'<span class="resolve-report-spinner" aria-hidden="true"></span>'
			);
		}

		try {
			const response = await postApi.resolveReport(postId, {
				action: "APPROVED",
				reasonCode,
				note
			});

			const successMsg = _str(response?.message) || "Xử lý vi phạm thành công!";

			// Đóng modal trước, rồi gọi callback
			close();
			if (typeof _onSuccess === "function") {
				_onSuccess(postId, successMsg);
			}
		} catch (error) {
			console.error("[ResolveReportModal] resolveReport error:", error);
			const errMsg =
				_str(error?.data?.message) ||
				_str(error?.message) ||
				"Không thể xử lý báo cáo. Vui lòng thử lại.";
			_showFeedback(errMsg, true);
		} finally {
			_isSubmitting = false;
			if (submitBtn) {
				submitBtn.disabled = false;
				const spinner = submitBtn.querySelector(".resolve-report-spinner");
				if (spinner) spinner.remove();
				const span = submitBtn.querySelector("span");
				const icon = submitBtn.querySelector("i");
				if (icon)  icon.className = "bx bx-shield-x";
				if (span)  span.textContent = "Xác nhận ẩn bài";
			}
		}
	};

	// ── bindEvents ────────────────────────────────────────────────────────────
	/** Gắn listeners — chỉ chạy 1 lần. */
	const _bindEvents = () => {
		if (_eventsAreBound) return;
		_eventsAreBound = true;

		_el(CLOSE_BTN_ID)?.addEventListener("click", () => close());
		_el(CANCEL_BTN_ID)?.addEventListener("click", () => close());

		// Click backdrop → đóng modal
		_el(MODAL_ID)?.addEventListener("click", (e) => {
			if (e.target === _el(MODAL_ID)) close();
		});

		// Phím Escape → đóng modal
		document.addEventListener("keydown", (e) => {
			if (e.key === "Escape" && !_el(MODAL_ID)?.classList.contains("is-hidden")) {
				close();
			}
		});

		// Submit form
		_el(FORM_ID)?.addEventListener("submit", _handleSubmit);
	};

	// ── open ──────────────────────────────────────────────────────────────────
	/**
	 * Mở modal xử lý vi phạm.
	 *
	 * @param {object} options
	 * @param {string}   options.postId          - ID bài đăng cần xử lý.
	 * @param {Array}    options.postReasonList   - Lý do bài này bị báo cáo [{reasonCode, count}].
	 * @param {Array}    options.allReasons       - Toàn bộ lý do từ API [{code, reason}].
	 * @param {Function} [options.onSuccess]      - Callback(postId, message) sau khi API thành công.
	 */
	const open = ({ postId, postReasonList = [], allReasons = [], onSuccess } = {}) => {
		const safePostId = _str(postId);
		if (!safePostId) {
			console.warn("[ResolveReportModal] open() bị gọi thiếu postId hợp lệ.");
			return;
		}

		// 1. Đảm bảo HTML đã inject
		_injectHTML();

		// 2. Gắn events (idempotent)
		_bindEvents();

		const modal = _el(MODAL_ID);
		const form  = _el(FORM_ID);
		if (!modal || !form) return;

		// 3. Lưu postId và callback
		modal.setAttribute(ACTIVE_POST_KEY, safePostId);
		_onSuccess = typeof onSuccess === "function" ? onSuccess : null;

		// 4. Reset form & feedback
		form.reset();
		_clearFeedback();
		_isSubmitting = false;
		const submitBtn = _el(SUBMIT_BTN_ID);
		if (submitBtn) {
			submitBtn.disabled = false;
			const span = submitBtn.querySelector("span");
			const icon = submitBtn.querySelector("i");
			if (icon) icon.className = "bx bx-shield-x";
			if (span) span.textContent = "Xác nhận ẩn bài";
			submitBtn.querySelectorAll(".resolve-report-spinner").forEach((s) => s.remove());
		}

		// 5. Render danh sách lý do
		_renderReasons(allReasons, postReasonList);

		// 6. Hiển thị modal
		modal.classList.remove("is-hidden");
		modal.setAttribute("aria-hidden", "false");
		document.body.style.overflow = "hidden";

		// 7. Focus vào nút đóng
		window.requestAnimationFrame(() => {
			_el(CLOSE_BTN_ID)?.focus();
		});
	};

	// ── close ─────────────────────────────────────────────────────────────────
	/** Đóng và reset modal. */
	const close = () => {
		const modal = _el(MODAL_ID);
		if (!modal) return;

		modal.classList.add("is-hidden");
		modal.setAttribute("aria-hidden", "true");
		modal.removeAttribute(ACTIVE_POST_KEY);
		document.body.style.overflow = "";

		_clearFeedback();
		_isSubmitting = false;
		_onSuccess    = null;
	};

	// ── Public interface ──────────────────────────────────────────────────────
	return Object.freeze({ open, close });
})();
