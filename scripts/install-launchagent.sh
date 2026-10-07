#!/bin/bash
# Karne Gönderici macOS Background LaunchAgent Installer
# Bu script uygulama kapalıyken bile planlanan saatte görevleri denetleyen macOS servisini kurar.

PLIST_NAME="com.batuhan.karnegonderici.scheduler.plist"
TARGET_DIR="$HOME/Library/LaunchAgents"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

mkdir -p "$TARGET_DIR"

if [ -f "$SCRIPT_DIR/$PLIST_NAME" ]; then
    cp "$SCRIPT_DIR/$PLIST_NAME" "$TARGET_DIR/$PLIST_NAME"
    launchctl unload "$TARGET_DIR/$PLIST_NAME" 2>/dev/null || true
    launchctl load "$TARGET_DIR/$PLIST_NAME"
    echo "✅ Karne Gönderici arka plan zamanlayıcısı başarıyla kuruldu ve başlatıldı."
    echo "📋 Durum kontrolü: launchctl list | grep karnegonderici"
else
    echo "❌ Hata: $PLIST_NAME dosyası bulunamadı."
    exit 1
fi
