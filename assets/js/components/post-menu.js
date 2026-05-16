"use strict";

import { isPostOwner } from "../utils/helpers.js";

// ---------------------------------------------------------------------------
// HTML Generator — dùng chung cho cả bài viết (feed/profile) lẫn comment-modal
// ---------------------------------------------------------------------------

/**
 * Tạo chuỗi HTML cho toàn bộ khối "menu 3 chấm".
 * Sử dụng các class CSS chung (.post-menu-wrap, .post-menu-btn, .post-dropdown-menu)
 * để tái sử dụng stylesheet hiện có.
 *
 * @param {{ type: 'post'|'comment', itemId: string, authorId: string }} options
 *   - type     : Loại nội dung ('post' hoặc 'comment') — ghi vào data-type
 *   - itemId   : ID của bài viết hoặc bình luận — ghi vào data-id và data-post-id (compat)
 *   - authorId : ID tác giả — dùng để kiểm tra quyền sở hữu
 * @returns {string} Chuỗi HTML hoàn chỉnh của dropdown menu
 */
export const generateDropdownMenuHtml = ({ type = "post", itemId = "", authorId = "" } = {}) => {
	const safeType = String(type);
	const safeId   = String(itemId);

	// Escape để an toàn khi nhúng vào HTML attribute
	const esc = (v) => String(v ?? "")
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#039;");

	const escId   = esc(safeId);
	const escType = esc(safeType);

	// data-post-id giữ để backward-compat với các event handler cũ trong feed.js
	const dataAttrs = `data-type="${escType}" data-id="${escId}" data-post-id="${escId}"`;

	const menuItems = isPostOwner(authorId)
		? `
			<button class="post-dropdown-item post-dropdown-item--edit" type="button"
				data-action="edit-post" ${dataAttrs}>
				<i class="bx bx-edit"></i>
				<span>Chỉnh sửa</span>
			</button>
			<button class="post-dropdown-item post-dropdown-item--delete" type="button"
				data-action="delete-post" ${dataAttrs}>
				<i class="bx bx-trash"></i>
				<span>Xóa</span>
			</button>`
		: `
			<button class="post-dropdown-item" type="button"
				data-action="report-post" ${dataAttrs}>
				<i class="bx bx-flag"></i>
				<span>Báo cáo</span>
			</button>`;

	return `
		<div class="post-menu-wrap">
			<button class="post-menu-btn" type="button" aria-label="Tùy chọn ${escType === "comment" ? "bình luận" : "bài đăng"}">
				<i class="bx bx-dots-horizontal-rounded"></i>
			</button>
			<div class="post-dropdown-menu">
				${menuItems}
			</div>
		</div>`;
};

// ---------------------------------------------------------------------------
// Event Delegation — gắn một lần duy nhất lên document
// Hoạt động với cả DOM tĩnh và DOM được inject động (comment-modal, v.v.)
// ---------------------------------------------------------------------------

let _menuDelegationInstalled = false;

/**
 * Khởi tạo logic đóng/mở cho tất cả dropdown menu dùng class .post-menu-wrap.
 * An toàn khi gọi nhiều lần — chỉ thực sự đăng ký listener một lần (idempotent).
 *
 * Lưu ý: Không xử lý dropdown bên trong comment-modal (có cơ chế position:fixed riêng
 * được quản lý bởi comment-modal.js). Hàm này chỉ điều khiển các menu trong feed/profile.
 */
export const initPostMenus = () => {
	if (_menuDelegationInstalled) return;
	_menuDelegationInstalled = true;

	/** Đóng tất cả menu đang mở, ngoại trừ `exceptWrap` (nếu truyền vào) */
	const closeAllMenus = (exceptWrap = null) => {
		document.querySelectorAll(".post-menu-wrap.open").forEach((wrap) => {
			if (wrap !== exceptWrap) {
				wrap.classList.remove("open");
			}
		});
	};

	// Click vào nút 3 chấm → toggle menu tương ứng, đóng các menu khác
	document.addEventListener("click", (event) => {
		const menuBtn = event.target.closest(".post-menu-btn");

		if (menuBtn) {
			// Bỏ qua nút ba chấm bên trong comment-modal
			// (comment-modal.js tự quản lý dropdown của mình)
			if (menuBtn.closest("#comment-modal")) return;

			event.stopPropagation();

			const wrap = menuBtn.closest(".post-menu-wrap");
			if (!wrap) return;

			const shouldOpen = !wrap.classList.contains("open");
			closeAllMenus();
			if (shouldOpen) {
				wrap.classList.add("open");
			}
			return;
		}

		// Click bên trong dropdown → chỉ đóng menu SAU KHI item được xử lý,
		// không đóng ngay lập tức để tránh conflict với event handler của feed.js
		const dropdownItem = event.target.closest(".post-dropdown-item");
		if (dropdownItem && !dropdownItem.closest("#comment-modal")) {
			// Để feed.js/profile.js xử lý action trước, rồi đóng menu
			window.setTimeout(() => closeAllMenus(), 0);
			return;
		}

		// Click ra ngoài bất kỳ .post-menu-wrap → đóng tất cả
		if (!event.target.closest(".post-menu-wrap")) {
			closeAllMenus();
		}
	});

	// Phím Escape → đóng tất cả menu (ngoài comment-modal)
	document.addEventListener("keydown", (event) => {
		if (event.key === "Escape") {
			closeAllMenus();
		}
	});
};
