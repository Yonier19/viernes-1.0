import zlib
import struct
import math
import os
import subprocess

def create_orb_png(width=256, height=256, theme='active'):
    raw_data = bytearray()
    cx, cy = width / 2.0, height / 2.0
    r_max = width * 0.48

    # Theme color definitions:
    # active: cyan/blue/purple arc reactor
    # paused: amber/gold
    # error: crimson/red
    for y in range(height):
        raw_data.append(0)  # filter type 0 (None)
        for x in range(width):
            dx = x - cx
            dy = y - cy
            dist = math.hypot(dx, dy)
            
            # Base dark obsidian background
            if dist > r_max:
                raw_data.extend([0, 0, 0, 0])
                continue
            
            angle = math.atan2(dy, dx)

            if theme == 'active':
                # Outer cyan border ring
                if abs(dist - r_max * 0.95) < 2.0:
                    raw_data.extend([0, 242, 254, 230])
                    continue

                # Outer tech dashed ring
                if abs(dist - r_max * 0.75) < 1.8:
                    dash = int((angle + math.pi) * 8) % 2
                    if dash == 0:
                        raw_data.extend([0, 242, 254, 200])
                        continue

                # Inner purple ring
                if abs(dist - r_max * 0.6) < 1.6:
                    dash2 = int((angle + math.pi) * 12) % 2
                    if dash2 == 0:
                        raw_data.extend([157, 78, 221, 190])
                        continue

                # Core glowing reactor
                core_dist = dist / (r_max * 0.42)
                if core_dist < 1.0:
                    factor = 1.0 - core_dist
                    r = int(255 * factor + 5 * (1 - factor))
                    g = int(255 * (factor**1.5) + 242 * (1 - factor) * 0.5)
                    b = int(255 * factor + 254 * (1 - factor))
                    a = 255
                    raw_data.extend([min(255, r), min(255, g), min(255, b), a])
                    continue

                # Intermediate space gradient
                halo_factor = max(0.0, 1.0 - (dist - r_max * 0.4) / (r_max * 0.55))
                r = int(11 * halo_factor + 5)
                g = int(25 * halo_factor + 8)
                b = int(55 * halo_factor + 17)
                a = int(240 * halo_factor + 220)
                raw_data.extend([r, g, b, min(255, a)])

            elif theme == 'paused':
                # Amber / Gold theme
                if abs(dist - r_max * 0.95) < 2.0:
                    raw_data.extend([255, 183, 3, 230])
                    continue
                if abs(dist - r_max * 0.75) < 1.8:
                    dash = int((angle + math.pi) * 8) % 2
                    if dash == 0:
                        raw_data.extend([251, 133, 0, 200])
                        continue
                if abs(dist - r_max * 0.6) < 1.6:
                    dash2 = int((angle + math.pi) * 12) % 2
                    if dash2 == 0:
                        raw_data.extend([255, 183, 3, 190])
                        continue
                core_dist = dist / (r_max * 0.42)
                if core_dist < 1.0:
                    factor = 1.0 - core_dist
                    r = int(255 * factor + 251 * (1 - factor))
                    g = int(255 * (factor**1.5) + 133 * (1 - factor))
                    b = int(200 * factor + 0)
                    raw_data.extend([min(255, max(0, r)), min(255, max(0, g)), min(255, max(0, b)), 255])
                    continue
                halo_factor = max(0.0, min(1.0, 1.0 - (dist - r_max * 0.4) / (r_max * 0.55)))
                raw_data.extend([
                    min(255, max(0, int(45 * halo_factor + 10))),
                    min(255, max(0, int(25 * halo_factor + 5))),
                    min(255, max(0, int(5 * halo_factor + 2))),
                    min(255, max(0, int(150 * halo_factor + 80)))
                ])

            else:  # error / crimson
                if abs(dist - r_max * 0.95) < 2.0:
                    raw_data.extend([239, 68, 68, 230])
                    continue
                if abs(dist - r_max * 0.75) < 1.8:
                    dash = int((angle + math.pi) * 8) % 2
                    if dash == 0:
                        raw_data.extend([220, 38, 38, 200])
                        continue
                if abs(dist - r_max * 0.6) < 1.6:
                    dash2 = int((angle + math.pi) * 12) % 2
                    if dash2 == 0:
                        raw_data.extend([185, 28, 28, 190])
                        continue
                core_dist = dist / (r_max * 0.42)
                if core_dist < 1.0:
                    factor = 1.0 - core_dist
                    r = int(255 * factor + 239 * (1 - factor))
                    g = int(200 * (factor**2) + 50 * (1 - factor))
                    b = int(200 * (factor**2) + 50 * (1 - factor))
                    raw_data.extend([min(255, max(0, r)), min(255, max(0, g)), min(255, max(0, b)), 255])
                    continue
                halo_factor = max(0.0, min(1.0, 1.0 - (dist - r_max * 0.4) / (r_max * 0.55)))
                raw_data.extend([
                    min(255, max(0, int(45 * halo_factor + 15))),
                    min(255, max(0, int(10 * halo_factor + 3))),
                    min(255, max(0, int(10 * halo_factor + 3))),
                    min(255, max(0, int(150 * halo_factor + 80)))
                ])

    # Construct PNG file
    def chunk(tag, data):
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff)

    header = b'\x89PNG\r\n\x1a\n'
    ihdr = chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0))
    idat = chunk(b'IDAT', zlib.compress(bytes(raw_data), 9))
    iend = chunk(b'IEND', b'')
    return header + ihdr + idat + iend

def create_ico(png_data):
    # Fallback basic single-entry ICO header (for 256x256 PNG)
    icondir = struct.pack('<HHH', 0, 1, 1)
    header_size = 6 + 16
    entry = struct.pack('<BBBBHHII', 0, 0, 0, 0, 1, 32, len(png_data), header_size)
    return icondir + entry + png_data

if __name__ == '__main__':
    build_dir = os.path.join(os.path.dirname(__file__), '..', 'build')
    os.makedirs(build_dir, exist_ok=True)
    
    # 1. Main Icon (256x256)
    png_bytes = create_orb_png(256, 256, theme='active')
    icon_png_path = os.path.join(build_dir, 'icon.png')
    icon_ico_path = os.path.join(build_dir, 'icon.ico')

    with open(icon_png_path, 'wb') as f:
        f.write(png_bytes)

    # 2. Tray status icons (32x32 and 64x64)
    tray_active = create_orb_png(64, 64, theme='active')
    tray_paused = create_orb_png(64, 64, theme='paused')
    tray_error = create_orb_png(64, 64, theme='error')

    with open(os.path.join(build_dir, 'tray-active.png'), 'wb') as f:
        f.write(tray_active)
    with open(os.path.join(build_dir, 'tray-paused.png'), 'wb') as f:
        f.write(tray_paused)
    with open(os.path.join(build_dir, 'tray-error.png'), 'wb') as f:
        f.write(tray_error)

    # 3. Create Windows multi-resolution icon.ico using ImageMagick if available
    converted = False
    try:
        subprocess.run(
            ['convert', icon_png_path, '-define', 'icon:auto-resize=256,128,64,48,32,16', icon_ico_path],
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE
        )
        converted = True
        print(f"[Icon Generator] Converted multi-res {icon_ico_path} via ImageMagick.")
    except Exception as e:
        print(f"[Icon Generator] ImageMagick not available or failed ({e}), using python fallback.")

    if not converted:
        with open(icon_ico_path, 'wb') as f:
            f.write(create_ico(png_bytes))

    print(f"[Icon Generator] Successfully generated icons in {build_dir}:")
    print(f"  - icon.png ({len(png_bytes)} bytes)")
    print(f"  - icon.ico ({os.path.getsize(icon_ico_path)} bytes)")
    print(f"  - tray-active.png ({len(tray_active)} bytes)")
    print(f"  - tray-paused.png ({len(tray_paused)} bytes)")
    print(f"  - tray-error.png ({len(tray_error)} bytes)")
