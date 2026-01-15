// ==UserScript==
// @name         YouTube Channel Watchlist Manager
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Quản lý watchlist các channel YouTube được phép xem
// @author       You
// @match        https://www.youtube.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @run-at       document-start
// @license thaieibvn@gmail.com
// ==/UserScript==

(function() {
    'use strict';

    // Cấu hình
    const CONFIG = {
        // URL của file JSON chứa whitelist (có thể là GitHub Gist, Pastebin raw, etc.)
        REMOTE_WHITELIST_URL: '', // Để trống nếu chỉ dùng local
        
        // Danh sách channel được phép (format: @channelhandle hoặc channel ID)
        DEFAULT_WHITELIST: [
            '@CrashCourse',
            '@TED',
            '@NationalGeographic',
            // Thêm các channel khác tại đây
        ],
        
        // Mật khẩu để truy cập cài đặt (tùy chọn)
        ADMIN_PASSWORD: 'admin123',
        
        // Thời gian cache danh sách remote (milliseconds)
        CACHE_DURATION: 3600000 // 1 giờ
    };

    // Lấy whitelist từ storage
    function getWhitelist() {
        const stored = GM_getValue('whitelist', null);
        if (stored) {
            return JSON.parse(stored);
        }
        GM_setValue('whitelist', JSON.stringify(CONFIG.DEFAULT_WHITELIST));
        return CONFIG.DEFAULT_WHITELIST;
    }

    // Cập nhật whitelist từ remote
    async function updateFromRemote() {
        if (!CONFIG.REMOTE_WHITELIST_URL) return false;
        
        const lastUpdate = GM_getValue('lastUpdate', 0);
        const now = Date.now();
        
        // Kiểm tra cache
        if (now - lastUpdate < CONFIG.CACHE_DURATION) {
            return false;
        }
        
        try {
            const response = await fetch(CONFIG.REMOTE_WHITELIST_URL);
            const data = await response.json();
            
            if (data.channels && Array.isArray(data.channels)) {
                GM_setValue('whitelist', JSON.stringify(data.channels));
                GM_setValue('lastUpdate', now);
                return true;
            }
        } catch (error) {
            console.error('Không thể cập nhật whitelist:', error);
        }
        
        return false;
    }

    // Lấy channel ID/handle từ URL hoặc trang
    function getCurrentChannel() {
        const url = window.location.href;
        
        // Kiểm tra URL pattern
        const patterns = [
            /youtube\.com\/@([^\/\?]+)/,           // @channelhandle
            /youtube\.com\/channel\/([^\/\?]+)/,    // channel ID
            /youtube\.com\/c\/([^\/\?]+)/,          // custom URL
            /youtube\.com\/user\/([^\/\?]+)/        // user URL
        ];
        
        for (const pattern of patterns) {
            const match = url.match(pattern);
            if (match) {
                return url.includes('/@') ? '@' + match[1] : match[1];
            }
        }
        
        // Lấy từ meta tag hoặc page data
        const metaChannel = document.querySelector('link[itemprop="url"]');
        if (metaChannel) {
            const channelUrl = metaChannel.getAttribute('href');
            if (channelUrl.includes('/@')) {
                return '@' + channelUrl.split('/@')[1].split('/')[0];
            }
        }
        
        return null;
    }

    // Kiểm tra channel có trong whitelist không
    function isChannelAllowed(channelId) {
        if (!channelId) return true; // Cho phép trang chủ và search
        
        const whitelist = getWhitelist();
        return whitelist.some(allowed => {
            return channelId.toLowerCase().includes(allowed.toLowerCase()) ||
                   allowed.toLowerCase().includes(channelId.toLowerCase());
        });
    }

    // Tạo overlay chặn
    function createBlockOverlay() {
        const overlay = document.createElement('div');
        overlay.id = 'yt-block-overlay';
        overlay.innerHTML = `
            <div style="
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: #fff;
                z-index: 999999;
                display: flex;
                align-items: center;
                justify-content: center;
                font-family: Arial, sans-serif;
            ">
                <div style="text-align: center; padding: 40px;">
                    <h1 style="color: #e74c3c; font-size: 48px; margin-bottom: 20px;">⛔</h1>
                    <h2 style="color: #2c3e50; margin-bottom: 10px;">Con không được phép truy cập trang này</h2>
                    <p style="color: #7f8c8d; margin-bottom: 30px;">Kênh này không nằm trong danh sách được phép xem.</p>
                    <p style="color: #95a5a6; font-size: 14px;">Đang chuyển hướng về Google trong <span id="countdown">3</span> giây...</p>
                </div>
            </div>
        `;
        
        document.documentElement.appendChild(overlay);
        
        // Đếm ngược và chuyển hướng
        let seconds = 3;
        const countdownEl = overlay.querySelector('#countdown');
        const interval = setInterval(() => {
            seconds--;
            if (countdownEl) countdownEl.textContent = seconds;
            
            if (seconds <= 0) {
                clearInterval(interval);
                window.location.href = 'https://www.google.com';
            }
        }, 1000);
    }

    // Kiểm tra và chặn nếu cần
    function checkAndBlock() {
        const channelId = getCurrentChannel();
        
        if (channelId && !isChannelAllowed(channelId)) {
            // Xóa nội dung hiện tại
            document.body.innerHTML = '';
            document.head.innerHTML = '';
            
            // Tạo overlay chặn
            createBlockOverlay();
            
            // Ngăn chặn navigation
            window.stop();
        }
    }

    // Menu quản lý
    function showManagementDialog() {
        const password = prompt('Nhập mật khẩu quản trị:');
        if (password !== CONFIG.ADMIN_PASSWORD) {
            alert('Mật khẩu không đúng!');
            return;
        }
        
        const whitelist = getWhitelist();
        const currentList = whitelist.join('\n');
        
        const newList = prompt(
            'Danh sách channel được phép (mỗi dòng một channel):\n' +
            'Format: @channelhandle hoặc channel_id',
            currentList
        );
        
        if (newList !== null) {
            const channels = newList.split('\n')
                .map(c => c.trim())
                .filter(c => c.length > 0);
            
            GM_setValue('whitelist', JSON.stringify(channels));
            alert('Đã cập nhật danh sách! Vui lòng tải lại trang.');
        }
    }

    // Đăng ký menu command
    GM_registerMenuCommand('⚙️ Quản lý Whitelist', showManagementDialog);
    GM_registerMenuCommand('🔄 Cập nhật từ Remote', async () => {
        const updated = await updateFromRemote();
        alert(updated ? 'Đã cập nhật danh sách!' : 'Không có cập nhật mới hoặc chưa cấu hình URL.');
    });

    // Khởi động
    async function init() {
        // Thử cập nhật từ remote
        await updateFromRemote();
        
        // Kiểm tra ngay lập tức
        checkAndBlock();
        
        // Theo dõi thay đổi URL (cho SPA)
        let lastUrl = location.href;
        new MutationObserver(() => {
            const url = location.href;
            if (url !== lastUrl) {
                lastUrl = url;
                setTimeout(checkAndBlock, 500);
            }
        }).observe(document, { subtree: true, childList: true });
    }

    // Chạy khi DOM sẵn sàng
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();