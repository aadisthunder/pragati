import os
import sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont
import imageio

def create_demo_video():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    mcp_dir = os.path.join(base_dir, ".playwright-mcp")

    # The 12 milestone screenshots in narrative order (Total 90.0s = 1m 30s)
    scenes = [
        {
            "file": "page-2026-09-25T17-39-37-842Z.png",
            "tag": "01 / PROBLEM STATEMENT",
            "title": "The AI Tutor Amnesia Problem",
            "desc": "Standard AI tutors reset every session, spoil answers, and lack cognitive adaptation.",
            "duration": 7.0
        },
        {
            "file": "page-2026-09-25T17-40-26-208Z.png",
            "tag": "02 / THE SOLUTION",
            "title": "Pragati: Self-Evolving Learning Companion",
            "desc": "Persistent goal memory across chats, autonomous mastery tools, and a 4-tier difficulty ladder.",
            "duration": 7.0
        },
        {
            "file": "page-2026-09-25T17-40-38-678Z.png",
            "tag": "03 / SYSTEM ARCHITECTURE",
            "title": "Engineered for Production Rigor",
            "desc": "Express & Edge backend parity, zero answer leakage, and live telemetry tracking.",
            "duration": 7.0
        },
        {
            "file": "page-2026-09-25T17-26-02-389Z.png",
            "tag": "04 / CLEAN PLATFORM UI",
            "title": "Compact Sidebar & Distraction-Free Workspace",
            "desc": "Chat sessions capped to 3 most recent, clean user profile card with nested Sign Out.",
            "duration": 7.0
        },
        {
            "file": "screenshot_topics.png",
            "tag": "05 / PERSISTENT CURRICULUM",
            "title": "My Topics: Live Mastery & Goals Tracking",
            "desc": "Tracked curriculum ('DSA') persists in database with real-time mastery per subtopic.",
            "duration": 8.0
        },
        {
            "file": "page-2026-09-25T17-27-28-899Z.png",
            "tag": "06 / CLEAN PROMPTING",
            "title": "Distraction-Free Topic Request",
            "desc": "Clicking 'Test me' sends only the clean topic name. No messy data dumps required.",
            "duration": 6.5
        },
        {
            "file": "page-2026-09-25T17-27-54-887Z.png",
            "tag": "07 / AUTONOMOUS AGENT",
            "title": "Dynamic 'check_topic_mastery' Execution",
            "desc": "AI calls tool in background, computes Beginner tier (<50%), and asks student to pick a subtopic.",
            "duration": 8.5
        },
        {
            "file": "page-2026-09-25T17-30-34-542Z.png",
            "tag": "08 / ZERO-LEAKAGE ENGINE",
            "title": "Interactive Quiz Card Generation",
            "desc": "Questions are never spoiled in plain chat text; interactive assessment card renders directly in UI.",
            "duration": 7.5
        },
        {
            "file": "page-2026-09-25T17-31-04-773Z.png",
            "tag": "09 / ADAPTIVE QUIZ ARENA",
            "title": "Adaptive Testing with Live Telemetry",
            "desc": "LaTeX math notation, per-question dwell timers, Socratic hint drawer, and dynamic ELO rating.",
            "duration": 8.5
        },
        {
            "file": "screenshot_quizzes.png",
            "tag": "10 / QUIZZES & ASSESSMENTS",
            "title": "Comprehensive Assessment Catalog & History",
            "desc": "Real-time records of attempts, scores, difficulty ratings, and automated performance tracking.",
            "duration": 7.5
        },
        {
            "file": "screenshot_analytics.png",
            "tag": "11 / COGNITIVE ANALYTICS",
            "title": "Student Mastery Radar & Review Queue",
            "desc": "Multi-dimensional performance breakdown, dwell telemetry, and Socratic remediation queue.",
            "duration": 8.5
        },
        {
            "file": "page-2026-09-25T17-26-23-750Z.png",
            "tag": "12 / PRODUCTION READY",
            "title": "Dual-Backend Parity & Cloud Ready",
            "desc": "Tested across 141 backend scenarios and 54 client tests. Deployed on Supabase & Firebase.",
            "duration": 7.0
        }
    ]

    target_w, target_h = 1920, 1080
    fps = 24
    fade_duration = 0.5
    fade_frames = int(fps * fade_duration)

    # Output paths
    out_desktop = os.path.join(base_dir, "Pragati_Demo_Walkthrough.mp4")
    out_public = os.path.join(base_dir, "client", "public", "Pragati_Demo_Walkthrough.mp4")

    # Font handling
    try:
        font_tag = ImageFont.truetype("arialbd.ttf", 20)
        font_title = ImageFont.truetype("arialbd.ttf", 32)
        font_desc = ImageFont.truetype("arial.ttf", 22)
    except Exception:
        font_tag = ImageFont.load_default()
        font_title = ImageFont.load_default()
        font_desc = ImageFont.load_default()

    def process_scene_image(scene_info):
        img_path = os.path.join(mcp_dir, scene_info["file"])
        if not os.path.exists(img_path):
            print(f"Warning: {img_path} not found, creating blank frame.")
            base = Image.new("RGB", (target_w, target_h), (15, 23, 42))
        else:
            raw = Image.open(img_path).convert("RGB")
            # Fit into 1920x1080 maintaining aspect ratio with subtle letterboxing if needed
            raw_w, raw_h = raw.size
            scale = min((target_w - 40) / raw_w, (target_h - 180) / raw_h)
            new_w = int(raw_w * scale)
            new_h = int(raw_h * scale)
            resized = raw.resize((new_w, new_h), Image.Resampling.LANCZOS)

            # Dark modern canvas
            base = Image.new("RGB", (target_w, target_h), (11, 15, 25))
            pos_x = (target_w - new_w) // 2
            pos_y = 20 + ((target_h - 180) - new_h) // 2
            base.paste(resized, (pos_x, pos_y))

        draw = ImageDraw.Draw(base)

        # Draw sleek lower-third banner
        banner_y = target_h - 140
        banner_h = 120

        # Semi-transparent dark banner
        banner_overlay = Image.new("RGBA", (target_w, target_h), (0, 0, 0, 0))
        bdraw = ImageDraw.Draw(banner_overlay)
        bdraw.rectangle([40, banner_y, target_w - 40, banner_y + banner_h], fill=(15, 23, 42, 235), outline=(99, 102, 241, 140), width=2)

        # Accent tab
        bdraw.rectangle([40, banner_y, 48, banner_y + banner_h], fill=(99, 102, 241, 255))
        base = Image.alpha_composite(base.convert("RGBA"), banner_overlay).convert("RGB")
        draw = ImageDraw.Draw(base)

        # Text on banner
        draw.text((70, banner_y + 14), scene_info["tag"], fill=(129, 140, 248), font=font_tag)
        draw.text((70, banner_y + 42), scene_info["title"], fill=(255, 255, 255), font=font_title)
        draw.text((70, banner_y + 82), scene_info["desc"], fill=(148, 163, 184), font=font_desc)

        return np.array(base)

    print("Rendering scene frames...")
    prepared_scenes = []
    for sc in scenes:
        arr = process_scene_image(sc)
        prepared_scenes.append({"image": arr, "frames": int(sc["duration"] * fps)})

    writer = imageio.get_writer(out_desktop, fps=fps, codec='libx264', quality=8, pixelformat='yuv420p')

    total_scenes = len(prepared_scenes)
    for idx, sc in enumerate(prepared_scenes):
        curr_img = sc["image"]
        n_frames = sc["frames"]
        next_img = prepared_scenes[idx + 1]["image"] if idx + 1 < total_scenes else None

        print(f"Encoding Scene {idx + 1}/{total_scenes} ({n_frames} frames)...")

        for f in range(n_frames):
            # Check if in transition phase to next slide
            if next_img is not None and f >= n_frames - fade_frames:
                alpha = (f - (n_frames - fade_frames)) / fade_frames
                frame = (curr_img * (1 - alpha) + next_img * alpha).astype(np.uint8)
            else:
                frame = curr_img

            writer.append_data(frame)

    writer.close()
    print(f"Successfully generated demo video: {out_desktop}")

    # Copy to public folder
    import shutil
    shutil.copy2(out_desktop, out_public)
    print(f"Copied to public web directory: {out_public}")

if __name__ == '__main__':
    create_demo_video()
