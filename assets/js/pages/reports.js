"use strict";

const ALLOWED_ROLES = new Set(["MODERATOR", "ADMIN"]);

const SIDEBAR_ITEMS = [
	{
		label: "Trang chủ",
		href: "feed.html",
		icon: "bx-home-alt-2"
	},
	{
		label: "Tạo bài đăng",
		href: "feed.html",
		icon: "bx-plus-circle"
	},
	{
		label: "Trang cá nhân",
		href: "profile.html",
		icon: "bx-user"
	},
	{
		label: "Thông báo",
		href: "notifications.html",
		icon: "bx-bell"
	},
	{
		label: "Cài đặt",
		href: "settings.html",
		icon: "bx-cog"
	},
	{
		label: "Quản lý báo cáo",
		href: "reports.html",
		icon: "bx-shield-quarter",
		roles: ["MODERATOR", "ADMIN"]
	}
];

const MOCK_REPORTED_POSTS = [
	{
		id: "post-101",
		authorName: "duyen.travels",
		authorAvatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=120&q=60",
		location: "Ninh Binh, Vietnam",
		time: "2h",
		tags: ["Nature", "Ninh Binh"],
		content: "Sáng sớm ở Tam Cốc rất yên bình, cảnh đẹp và không khí trong lành.",
		imageUrl: "https://images.unsplash.com/photo-1528127269322-539801943592?auto=format&fit=crop&w=1200&q=70",
		likeCount: "1,482",
		reportCount: 4,
		reportReason: "Nghi ngờ nội dung spam"
	},
	{
		id: "post-102",
		authorName: "son.wander",
		authorAvatar: "https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?auto=format&fit=crop&w=120&q=60",
		location: "Da Nang, Vietnam",
		time: "6h",
		tags: ["Cityscape", "Da Nang"],
		content: "Đà Nẵng buổi tối lên đèn rất đẹp, bài viết này đang bị báo cáo vì nghi có thông tin sai sự thật.",
		imageUrl: "https://images.unsplash.com/photo-1467269204594-9661b134dd2b?auto=format&fit=crop&w=1200&q=70",
		likeCount: "2,097",
		reportCount: 2,
		reportReason: "Thông tin không chính xác"
	},
	{
		id: "post-103",
		authorName: "annie.go",
		authorAvatar: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=120&q=60",
		location: "Hoi An, Vietnam",
		time: "1d",
		tags: ["Culture", "Hoi An"],
		content: "Phố cổ Hội An về đêm rất đẹp, bài viết này bị báo cáo vì nghi tái sử dụng hình ảnh không có nguồn.",
		imageUrl: "https://images.unsplash.com/photo-1555400038-63f5ba517a47?auto=format&fit=crop&w=1200&q=70",
		likeCount: "3,214",
		reportCount: 5,
		reportReason: "Nghi ngờ vi phạm bản quyền hình ảnh"
	}
];

const escapeHtml = (value) => {
	return String(value)
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/\"/g, "&quot;")
		.replace(/'/g, "&#039;");
};

const getUserRole = () => {
	const role = localStorage.getItem("userRole");
	return typeof role === "string" ? role.trim().toUpperCase() : "";
};

const ensureModeratorAccess = () => {
	const userRole = getUserRole();

	if (!ALLOWED_ROLES.has(userRole)) {
		window.location.href = "feed.html";
		return null;
	}

	return userRole;
};

const renderSidebar = (userRole) => {
	const sidebar = document.getElementById("app-sidebar");
	if (!sidebar) {
		return;
	}

	const currentPage = window.location.pathname.split("/").pop() || "reports.html";

	const navHtml = SIDEBAR_ITEMS
		.filter((item) => !Array.isArray(item.roles) || item.roles.includes(userRole))
		.map((item) => {
			const activeClass = item.href === currentPage ? " active" : "";
			return `
				<a class="nav-item${activeClass}" href="${item.href}">
					<i class="bx ${item.icon}"></i>
					<span class="nav-label">${item.label}</span>
				</a>
			`;
		})
		.join("");

	sidebar.innerHTML = `
		<h1 class="brand">DUTraveler</h1>
		<nav class="side-nav" aria-label="Sidebar navigation">
			${navHtml}
		</nav>
	`;
};

async function fetchReportedPosts() {
	return new Promise((resolve) => {
		setTimeout(() => {
			resolve(MOCK_REPORTED_POSTS);
		}, 350);
	});
}

const buildTagsHtml = (tags) => {
	if (!Array.isArray(tags) || tags.length === 0) {
		return "";
	}

	return `
		<div class="post-tags">
			${tags.map((tag) => `<span class="post-tag">${escapeHtml(tag)}</span>`).join("")}
		</div>
	`;
};

const createPostCardHtml = (post) => {
	const tagsHtml = buildTagsHtml(post.tags);
	const imageHtml = post.imageUrl
		? `<img class="post-image" src="${escapeHtml(post.imageUrl)}" alt="Ảnh bài đăng bị báo cáo">`
		: "";

	return `
		<article class="post-card" data-post-id="${escapeHtml(post.id)}">
			<header class="post-header">
				<div class="post-author">
					<img class="avatar" src="${escapeHtml(post.authorAvatar)}" alt="Avatar ${escapeHtml(post.authorName)}">
					<div class="post-meta">
						<div class="post-meta-row">
							<h3>${escapeHtml(post.authorName)}</h3>
							<span class="meta-divider">&bull;</span>
							<span class="post-time">${escapeHtml(post.time)}</span>
						</div>
						<p>${escapeHtml(post.location)}</p>
					</div>
				</div>
			</header>

			${tagsHtml}
			${imageHtml}

			<div class="post-actions">
				<div class="left-actions">
					<button class="icon-btn" type="button" aria-label="Thích bài viết">
						<i class="bx bx-heart"></i>
					</button>
					<button class="icon-btn" type="button" aria-label="Bình luận bài viết">
						<i class="bx bx-comment"></i>
					</button>
					<button class="icon-btn" type="button" aria-label="Chia sẻ bài viết">
						<i class="bx bx-send"></i>
					</button>
				</div>

				<button class="icon-btn" type="button" aria-label="Lưu bài viết">
					<i class="bx bx-bookmark"></i>
				</button>
			</div>

			<footer class="post-footer">
				<p class="likes">${escapeHtml(post.likeCount)} lượt thích</p>
				<p class="caption"><strong>${escapeHtml(post.authorName)}</strong>${escapeHtml(post.content)}</p>
			</footer>

			<p class="report-meta">
				<i class="bx bx-flag"></i>
				<span>${escapeHtml(post.reportReason)} - ${escapeHtml(post.reportCount)} báo cáo</span>
			</p>

			<div class="report-actions">
				<button class="report-action-btn report-delete-btn" type="button" data-action="delete">
					<i class="bx bx-trash"></i>
					<span>Xóa bài đăng</span>
				</button>
				<button class="report-action-btn report-ignore-btn" type="button" data-action="ignore">
					<i class="bx bx-check-circle"></i>
					<span>Bỏ qua báo cáo</span>
				</button>
			</div>
		</article>
	`;
};

const updateReportCount = () => {
	const countBadge = document.getElementById("reports-count-badge");
	const cardCount = document.querySelectorAll("#reported-post-list .post-card").length;

	if (!countBadge) {
		return;
	}

	countBadge.textContent = `${cardCount} bài viết bị báo cáo`;
};

const syncEmptyState = () => {
	const list = document.getElementById("reported-post-list");
	const emptyState = document.getElementById("reports-empty-state");
	if (!list || !emptyState) {
		return;
	}

	const hasItems = list.querySelector(".post-card") !== null;
	emptyState.classList.toggle("is-hidden", hasItems);
};

const handleReportAction = (event) => {
	const clickedButton = event.target.closest(".report-action-btn");
	if (!clickedButton) {
		return;
	}

	const shouldRemove = window.confirm("Bạn có chắc chắn muốn xóa?");
	if (!shouldRemove) {
		return;
	}

	const postCard = clickedButton.closest(".post-card");
	postCard?.remove();
	updateReportCount();
	syncEmptyState();
};

const renderReportedPosts = (posts) => {
	const reportedPostList = document.getElementById("reported-post-list");
	if (!reportedPostList) {
		return;
	}

	reportedPostList.innerHTML = posts.map(createPostCardHtml).join("");
	reportedPostList.addEventListener("click", handleReportAction);
	updateReportCount();
	syncEmptyState();
};

const initReportsPage = async () => {
	const userRole = ensureModeratorAccess();
	if (!userRole) {
		return;
	}

	renderSidebar(userRole);

	try {
		const reportedPosts = await fetchReportedPosts();
		renderReportedPosts(reportedPosts);
	} catch (error) {
		console.error("Không thể tải danh sách báo cáo:", error);
		renderReportedPosts([]);
	}
};

document.addEventListener("DOMContentLoaded", initReportsPage);
