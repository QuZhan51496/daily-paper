document.addEventListener("DOMContentLoaded", () => {
    // profile 缓存：保存当前选中的 profile_id，导航时自动携带
    var profileSelect = document.getElementById("profile-select");
    if (profileSelect && profileSelect.value) {
        localStorage.setItem("profile_id", profileSelect.value);
    }
    // 如果 URL 没有 profile_id 但 localStorage 有，自动跳转
    var params = new URLSearchParams(window.location.search);
    var savedPid = localStorage.getItem("profile_id");
    if (profileSelect && !params.has("profile_id") && savedPid) {
        // 检查 savedPid 是否在下拉选项中
        var found = Array.from(profileSelect.options).some(function(o) { return o.value === savedPid; });
        if (found) {
            params.set("profile_id", savedPid);
            window.location.href = window.location.pathname + "?" + params.toString();
            return;
        } else {
            localStorage.removeItem("profile_id");
        }
    }
    // profile 切换时更新 localStorage
    if (profileSelect) {
        profileSelect.addEventListener("change", function() {
            if (this.value) {
                localStorage.setItem("profile_id", this.value);
            } else {
                localStorage.removeItem("profile_id");
            }
        });
    }

    // 导航链接只携带 profile_id，不携带日期（各论文源各自 fallback）
    document.querySelectorAll("a[data-nav]").forEach(function(link) {
        link.addEventListener("click", function(e) {
            e.preventDefault();
            var pid = localStorage.getItem("profile_id");
            var url = this.getAttribute("href");
            if (pid) url += "?profile_id=" + pid;
            window.location.href = url;
        });
    });

    const setupForm = document.getElementById("setup-form");
    if (setupForm) {
        setupForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const msg = document.getElementById("setup-msg");
            const data = {
                llm_api_key: document.getElementById("api_key").value,
                llm_base_url: document.getElementById("base_url").value,
                llm_model: document.getElementById("model").value,
                auto_fetch_interval: parseInt(document.getElementById("auto_fetch_interval").value) || 0,
            };
            msg.textContent = "保存中...";
            msg.className = "msg";
            try {
                const resp = await fetch("/api/setup", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(data),
                });
                if (resp.ok) {
                    msg.textContent = "配置已保存！正在跳转...";
                    msg.className = "msg success";
                    setTimeout(() => window.location.href = "/", 1500);
                } else {
                    const err = await resp.json();
                    msg.textContent = "错误: " + (err.detail || "保存失败");
                    msg.className = "msg error";
                }
            } catch (err) {
                msg.textContent = "网络错误: " + err.message;
                msg.className = "msg error";
            }
        });
    }
});

async function fetchPapers(date) {
    const msg = document.getElementById("fetch-msg");
    if (msg) {
        msg.textContent = "正在抓取论文...";
        msg.className = "msg";
    }
    try {
        const resp = await fetch(`/api/fetch?date=${date}`, { method: "POST" });
        if (resp.ok) {
            const data = await resp.json();
            if (data.fetched > 0) {
                if (msg) {
                    msg.textContent = `成功抓取 ${data.fetched} 篇论文！正在刷新...`;
                    msg.className = "msg success";
                }
                setTimeout(() => window.location.reload(), 1500);
            } else {
                if (msg) {
                    msg.textContent = "该日期暂无论文数据";
                    msg.className = "msg";
                }
            }
        } else {
            const err = await resp.json();
            if (msg) {
                msg.textContent = "抓取失败: " + (err.detail || "未知错误");
                msg.className = "msg error";
            }
        }
    } catch (err) {
        if (msg) {
            msg.textContent = "网络错误: " + err.message;
            msg.className = "msg error";
        }
    }
}

async function syncPapers(date) {
    const msg = document.getElementById("fetch-msg");
    try {
        const resp = await fetch(`/api/fetch?date=${date}`, { method: "POST" });
        if (resp.ok) {
            const data = await resp.json();
            if (data.inserted > 0) {
                // 有新增论文，刷新页面
                if (msg) {
                    msg.textContent = `发现 ${data.inserted} 篇新论文，正在刷新...`;
                    msg.className = "msg success";
                }
                setTimeout(() => window.location.reload(), 800);
            } else if (data.fetched === 0 && msg) {
                // HF API 该日期无论文
                msg.textContent = "该日期暂无论文数据";
                msg.className = "msg";
            }
            // fetched > 0 但 inserted === 0 表示没有新增，不做任何事
        } else {
            if (msg) {
                const err = await resp.json();
                msg.textContent = "同步失败: " + (err.detail || "未知错误");
                msg.className = "msg error";
            }
        }
    } catch (err) {
        if (msg) {
            msg.textContent = "网络错误: " + err.message;
            msg.className = "msg error";
        }
    }
}

function pollBriefs(date, immediate) {
    // 没有 pending 元素就不轮询
    if (!document.querySelector(".summary-pending")) return;

    var delay = immediate ? 0 : 1000;
    setTimeout(async function() {
        try {
            var resp = await fetch("/api/papers?date=" + date);
            if (!resp.ok) return;
            var papers = await resp.json();
            var stillPending = false;
            papers.forEach(function(p) {
                var el = document.getElementById("brief-" + p.id);
                if (!el) return;
                var summaryEl = el.querySelector("p");
                if (!summaryEl) return;
                if (p.brief_summary_status === "completed" && p.brief_summary) {
                    summaryEl.textContent = p.brief_summary;
                    summaryEl.className = "";
                } else if (p.brief_summary_status === "failed") {
                    summaryEl.textContent = "概要生成失败";
                    summaryEl.className = "summary-failed";
                } else {
                    stillPending = true;
                }
            });
            if (stillPending) {
                pollBriefs(date, false);
            }
        } catch (e) {}
    }, delay);
}

async function resummarize(paperId) {
    try {
        const resp = await fetch(`/api/resummarize/${paperId}`, { method: "POST" });
        if (resp.ok) {
            window.location.reload();
        } else {
            alert("摘要生成失败，请稍后重试");
        }
    } catch (err) {
        alert("网络错误: " + err.message);
    }
}

async function regenerateBrief(paperId, btn) {
    const container = document.getElementById(`brief-${paperId}`);
    const summaryEl = container.querySelector("p");
    if (summaryEl) {
        summaryEl.textContent = "概要重新生成中...";
        summaryEl.className = "summary-pending";
    }
    btn.disabled = true;
    try {
        const resp = await fetch(`/api/regenerate_brief/${paperId}`, { method: "POST" });
        if (resp.ok) {
            const data = await resp.json();
            if (summaryEl) {
                summaryEl.textContent = data.summary;
                summaryEl.className = "";
            }
        } else {
            if (summaryEl) {
                summaryEl.textContent = "概要生成失败";
                summaryEl.className = "summary-failed";
            }
        }
    } catch (err) {
        if (summaryEl) {
            summaryEl.textContent = "网络错误: " + err.message;
            summaryEl.className = "summary-failed";
        }
    }
    btn.disabled = false;
}

// ── Regen all briefs ─────────────────────────────────────────

async function regenAllBriefs() {
    var btn = document.getElementById("btn-regen-all");
    if (!btn) return;
    btn.disabled = true;
    btn.textContent = "生成中...";

    var isArxiv = window.location.pathname.startsWith("/arxiv");
    var datePicker = document.getElementById("date-picker");
    var date = datePicker ? datePicker.value : "";
    var profileId = new URLSearchParams(window.location.search).get("profile_id") || localStorage.getItem("profile_id") || "";

    var url = isArxiv
        ? `/api/arxiv/regen_briefs?date=${date}&profile_id=${profileId}`
        : `/api/regen_briefs?date=${date}&profile_id=${profileId}`;

    try {
        var resp = await fetch(url, { method: "POST" });
        if (resp.ok) {
            var data = await resp.json();
            if (data.count > 0) {
                btn.textContent = `生成中 (${data.count} 篇)...`;
                // 把 failed 状态改为 pending，触发轮询
                document.querySelectorAll(".summary-failed").forEach(function(el) {
                    el.textContent = "概要生成中...";
                    el.className = "summary-pending";
                });
                // 轮询等待生成完成
                if (isArxiv) {
                    pollArxivBriefs(date, profileId);
                } else {
                    pollBriefs(date, true);
                }
                // 定时检查是否还有 pending
                var checkInterval = setInterval(function() {
                    if (!document.querySelector(".summary-pending")) {
                        clearInterval(checkInterval);
                        btn.textContent = "⟳ 生成概要";
                        btn.disabled = false;
                    }
                }, 1000);
            } else {
                btn.textContent = "⟳ 生成概要";
                btn.disabled = false;
            }
        } else {
            btn.textContent = "生成失败";
            setTimeout(function() { btn.textContent = "⟳ 生成概要"; btn.disabled = false; }, 2000);
        }
    } catch (e) {
        btn.textContent = "网络错误";
        setTimeout(function() { btn.textContent = "⟳ 生成概要"; btn.disabled = false; }, 2000);
    }
}

// ── arXiv functions ──────────────────────────────────────────

async function syncArxivPapers(date, categories) {
    const msg = document.getElementById("fetch-msg");
    try {
        const resp = await fetch(`/api/arxiv/fetch?date=${date}&categories=${encodeURIComponent(categories)}`, { method: "POST" });
        if (resp.ok) {
            const data = await resp.json();
            if (data.inserted > 0) {
                if (msg) {
                    msg.textContent = `发现 ${data.inserted} 篇新论文，正在刷新...`;
                    msg.className = "msg success";
                }
                setTimeout(() => window.location.reload(), 800);
            } else if (data.fetched === 0 && msg) {
                msg.textContent = "该日期暂无论文数据";
                msg.className = "msg";
            }
        } else {
            if (msg) {
                msg.textContent = "该日期暂无论文数据";
                msg.className = "msg";
            }
        }
    } catch (err) {
        if (msg) {
            msg.textContent = "网络错误: " + err.message;
            msg.className = "msg error";
        }
    }
}

function pollArxivBriefs(date, profileId) {
    if (!document.querySelector(".summary-pending")) return;

    setTimeout(async function() {
        try {
            var url = "/api/arxiv/papers?date=" + date;
            if (profileId) url += "&profile_id=" + profileId;
            var resp = await fetch(url);
            if (!resp.ok) return;
            var papers = await resp.json();
            var stillPending = false;
            papers.forEach(function(p) {
                var el = document.getElementById("arxiv-brief-" + p.id);
                if (!el) return;
                var summaryEl = el.querySelector("p");
                if (!summaryEl) return;
                if (p.brief_summary_status === "completed" && p.brief_summary) {
                    summaryEl.textContent = p.brief_summary;
                    summaryEl.className = "";
                } else if (p.brief_summary_status === "failed") {
                    summaryEl.textContent = "概要生成失败";
                    summaryEl.className = "summary-failed";
                } else {
                    stillPending = true;
                }
            });
            if (stillPending) {
                pollArxivBriefs(date, profileId);
            }
        } catch (e) {}
    }, 1000);
}

async function regenerateArxivBrief(paperId, btn) {
    const container = document.getElementById(`arxiv-brief-${paperId}`);
    const summaryEl = container.querySelector("p");
    if (summaryEl) {
        summaryEl.textContent = "概要重新生成中...";
        summaryEl.className = "summary-pending";
    }
    btn.disabled = true;
    try {
        const resp = await fetch(`/api/arxiv/regenerate_brief/${paperId}`, { method: "POST" });
        if (resp.ok) {
            const data = await resp.json();
            if (summaryEl) {
                summaryEl.textContent = data.summary;
                summaryEl.className = "";
            }
        } else {
            if (summaryEl) {
                summaryEl.textContent = "概要生成失败";
                summaryEl.className = "summary-failed";
            }
        }
    } catch (err) {
        if (summaryEl) {
            summaryEl.textContent = "网络错误";
            summaryEl.className = "summary-failed";
        }
    }
    btn.disabled = false;
}
