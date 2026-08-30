# -*- coding: utf-8 -*-
"""合并封面与正文，输出最终 PDF"""
import sys, os
sys.path.insert(0, r"C:\Users\28402\.zcode\cli\plugins\cache\zcode-plugins-official\document-skills\0.1.4\skills\pdf\scripts")
from cover_render import render_cover, detect_fonts
from pypdf import PdfReader, PdfWriter, Transformation

BASE = os.path.dirname(os.path.abspath(__file__))
A4_W, A4_H = 595.28, 841.89

fonts = detect_fonts()
content = {
    "kicker": "项目面试全解 · SKY TAKE-OUT INTERVIEW GUIDE",
    "hero": "苍穹外卖",
    "summary": "从零读懂一个 Spring Boot 外卖系统：架构分层、登录链路、缓存一致性、来单提醒与 AI Agent 增强，"
               "配 8 张原创图解、18 道面试快答与可直接背诵的开场话术。",
    "meta": "技术栈：Spring Boot 2.7 · MySQL 8 · Redis · WebSocket · AI Agent · 2026 年 8 月",
    "footer": "SKY-TAKE-OUT · INTERVIEW EDITION",
    "year": "2026", "word": "GUIDE",
}
palette = {"primary": "#2587a8", "text": "#201f1d", "muted": "#85837b", "bg": "#ffffff"}
render_cover("01", content, os.path.join(BASE, "cover.pdf"), palette=palette, fonts=fonts)

def normalize(page):
    box = page.mediabox
    w, h = float(box.width), float(box.height)
    if abs(w - A4_W) > 2 or abs(h - A4_H) > 2:
        page.add_transformation(Transformation().scale(sx=A4_W / w, sy=A4_H / h))
        page.mediabox.lower_left = (0, 0)
        page.mediabox.upper_right = (A4_W, A4_H)
    return page

writer = PdfWriter()
writer.add_page(normalize(PdfReader(os.path.join(BASE, "cover.pdf")).pages[0]))
for p in PdfReader(os.path.join(BASE, "body.pdf")).pages:
    writer.add_page(normalize(p))
writer.add_metadata({'/Title': '苍穹外卖项目面试全解', '/Author': 'Z.ai', '/Creator': 'Z.ai',
                     '/Subject': 'Spring Boot 外卖项目从零讲解与面试准备'})
out = os.path.join(BASE, 'final.pdf')
with open(out, 'wb') as f:
    writer.write(f)
print('final.pdf 合并完成，页数:', len(writer.pages))
