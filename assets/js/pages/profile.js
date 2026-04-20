"use strict";

import { initCommentModal } from "./comment-modal.js";
import { initCreatePostModal } from "./create-post-modal.js";
import { initPostInteractions } from "./post-interactions.js";

const initProfilePage = () => {
	initCreatePostModal();
	initCommentModal(".profile-grid .grid-item");
	initPostInteractions();
};

document.addEventListener("DOMContentLoaded", initProfilePage);
