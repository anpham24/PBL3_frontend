"use strict";

import { initCreatePostModal } from "./create-post-modal.js";

const initNotificationsPage = () => {
	initCreatePostModal();
};

document.addEventListener("DOMContentLoaded", initNotificationsPage);
