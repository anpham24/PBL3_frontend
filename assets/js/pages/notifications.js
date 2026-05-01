"use strict";

import { initCreatePostModal } from "../components/create-post-modal.js";

const initNotificationsPage = () => {
	initCreatePostModal();
};

document.addEventListener("DOMContentLoaded", initNotificationsPage);
