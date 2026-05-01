const fs = require('fs');

function cleanFile(fileName) {
  let content = fs.readFileSync(fileName, 'utf8');

  content = content.replace(/import \{ getCurrentUser \} from \"\.\.\/utils\/auth\.js\";/,
    'import { getCurrentUser } from "../utils/auth.js";\nimport { initCreatePostModal } from "../components/create-post-modal.js";');

  content = content.replace(/const SIDEBAR_BASE_ITEMS = \[\s*\{[\s\S]*?\];/g, '');
  content = content.replace(/const SIDEBAR_MANAGEMENT_ITEMS = \[\s*\{[\s\S]*?\];/g, '');

  content = content.replace(/const getCurrentPage = \(\) => \{[\s\S]*?\};\n\n/g, '');
  content = content.replace(/const isVisibleForRole = \([\s\S]*?\};\n\n/g, '');
  content = content.replace(/const isActiveSidebarItem = [\s\S]*?;\n\n/g, '');
  content = content.replace(/const renderSidebar = \([\s\S]*?\};\n\n/g, '');

  content = content.replace(/renderSidebar\(.*?\);/, 'initCreatePostModal();');

  // Any remaining corrupted strings mapping
  content = content.replace(/Trang ch\? /g, 'Trang chủ');
  content = content.replace(/T\?o bAi \?ng/g, 'Tạo bài đăng');

  fs.writeFileSync('d:/HK4/PBL3/frontend_PBL3/assets/js/pages/' + fileName.replace('old_', ''), content, 'utf8');
}

cleanFile('old_reports.js');
cleanFile('old_users.js');
console.log('Cleaned both JS files');
