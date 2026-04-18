package service

import (
	"bytes"
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"image"
	"image/color"
	"image/draw"
	"image/png"
	"math/big"
	"strings"
	"sync"
	"time"

	"github.com/din4e/cuddlegecko/pkg/config"
)

const charset = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

type captchaEntry struct {
	answer    string
	expiresAt time.Time
}

type CaptchaService struct {
	cfg     config.CaptchaConfig
	store   sync.Map
}

func NewCaptchaService(cfg config.CaptchaConfig) *CaptchaService {
	cs := &CaptchaService{cfg: cfg}
	go cs.cleanup()
	return cs
}

func (s *CaptchaService) Enabled() bool {
	return s.cfg.Enabled
}

func (s *CaptchaService) Generate() (id string, imageBase64 string, err error) {
	answer := s.randomText(s.cfg.Length)
	id = s.randomText(16)

	s.store.Store(strings.ToLower(id), captchaEntry{
		answer:    strings.ToLower(answer),
		expiresAt: time.Now().Add(5 * time.Minute),
	})

	img := s.renderImage(answer)

	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		return "", "", err
	}

	return id, base64.StdEncoding.EncodeToString(buf.Bytes()), nil
}

func (s *CaptchaService) Verify(id string, answer string) bool {
	if !s.cfg.Enabled {
		return true
	}

	key := strings.ToLower(id)
	val, ok := s.store.LoadAndDelete(key)
	if !ok {
		return false
	}

	entry := val.(captchaEntry)
	if time.Now().After(entry.expiresAt) {
		return false
	}

	return strings.ToLower(answer) == entry.answer
}

func (s *CaptchaService) randomText(length int) string {
	var sb strings.Builder
	for i := 0; i < length; i++ {
		n, _ := rand.Int(rand.Reader, big.NewInt(int64(len(charset))))
		sb.WriteByte(charset[n.Int64()])
	}
	return sb.String()
}

func (s *CaptchaService) renderImage(text string) *image.RGBA {
	width := len(text)*32 + 40
	height := 60
	img := image.NewRGBA(image.Rect(0, 0, width, height))

	draw.Draw(img, img.Bounds(), &image.Uniform{color.White}, image.Point{}, draw.Src)

	// Draw noise lines
	for i := 0; i < 5; i++ {
		c := color.RGBA{
			R: uint8(s.randInt(100, 200)),
			G: uint8(s.randInt(100, 200)),
			B: uint8(s.randInt(100, 200)),
			A: 255,
		}
		x0 := s.randInt(0, width)
		y0 := s.randInt(0, height)
		x1 := s.randInt(0, width)
		y1 := s.randInt(0, height)
		drawLine(img, x0, y0, x1, y1, c)
	}

	// Draw noise dots
	for i := 0; i < 50; i++ {
		x := s.randInt(0, width)
		y := s.randInt(0, height)
		c := color.RGBA{
			R: uint8(s.randInt(50, 200)),
			G: uint8(s.randInt(50, 200)),
			B: uint8(s.randInt(50, 200)),
			A: 255,
		}
		img.Set(x, y, c)
	}

	// Draw each character
	for i, ch := range text {
		x := 20 + i*32 + s.randInt(-3, 3)
		y := 15 + s.randInt(-5, 5)
		c := color.RGBA{
			R: uint8(s.randInt(0, 100)),
			G: uint8(s.randInt(0, 100)),
			B: uint8(s.randInt(100, 255)),
			A: 255,
		}
		drawChar(img, x, y, ch, c)
	}

	return img
}

func (s *CaptchaService) randInt(min, max int) int {
	n, _ := rand.Int(rand.Reader, big.NewInt(int64(max-min)))
	return int(n.Int64()) + min
}

func drawChar(img *image.RGBA, x, y int, ch rune, c color.Color) {
	font := buildFont5x7()
	bits, ok := font[string(ch)]
	if !ok {
		return
	}
	for row := 0; row < 7; row++ {
		for col := 0; col < 5; col++ {
			if bits[row]&(1<<(4-col)) != 0 {
				// Draw a 3x3 block for each pixel to scale up
				for dy := 0; dy < 3; dy++ {
					for dx := 0; dx < 3; dx++ {
						px := x + col*3 + dx
						py := y + row*3 + dy
						if px >= 0 && px < img.Bounds().Dx() && py >= 0 && py < img.Bounds().Dy() {
							img.Set(px, py, c)
						}
					}
				}
			}
		}
	}
}

func drawLine(img *image.RGBA, x0, y0, x1, y1 int, c color.Color) {
	dx := abs(x1 - x0)
	dy := abs(y1 - y0)
	sx, sy := 1, 1
	if x0 > x1 {
		sx = -1
	}
	if y0 > y1 {
		sy = -1
	}
	err := dx - dy

	for {
		if x0 >= 0 && x0 < img.Bounds().Dx() && y0 >= 0 && y0 < img.Bounds().Dy() {
			img.Set(x0, y0, c)
		}
		if x0 == x1 && y0 == y1 {
			break
		}
		e2 := 2 * err
		if e2 > -dy {
			err -= dy
			x0 += sx
		}
		if e2 < dx {
			err += dx
			y0 += sy
		}
	}
}

func abs(x int) int {
	if x < 0 {
		return -x
	}
	return x
}

// buildFont5x7 returns a minimal 5x7 bitmap font for captcha characters.
func buildFont5x7() map[string][7]byte {
	return map[string][7]byte{
		"A": {0b01110, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001},
		"B": {0b11110, 0b10001, 0b10001, 0b11110, 0b10001, 0b10001, 0b11110},
		"C": {0b01110, 0b10001, 0b10000, 0b10000, 0b10000, 0b10001, 0b01110},
		"D": {0b11110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b11110},
		"E": {0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111},
		"F": {0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b10000},
		"G": {0b01110, 0b10001, 0b10000, 0b10111, 0b10001, 0b10001, 0b01110},
		"H": {0b10001, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001},
		"J": {0b00111, 0b00010, 0b00010, 0b00010, 0b00010, 0b10010, 0b01100},
		"K": {0b10001, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010, 0b10001},
		"L": {0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111},
		"M": {0b10001, 0b11011, 0b10101, 0b10101, 0b10001, 0b10001, 0b10001},
		"N": {0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001, 0b10001},
		"P": {0b11110, 0b10001, 0b10001, 0b11110, 0b10000, 0b10000, 0b10000},
		"R": {0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001},
		"S": {0b01110, 0b10001, 0b10000, 0b01110, 0b00001, 0b10001, 0b01110},
		"T": {0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100},
		"U": {0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110},
		"V": {0b10001, 0b10001, 0b10001, 0b10001, 0b01010, 0b01010, 0b00100},
		"W": {0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b11011, 0b10001},
		"X": {0b10001, 0b10001, 0b01010, 0b00100, 0b01010, 0b10001, 0b10001},
		"Y": {0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100},
		"Z": {0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b10000, 0b11111},
		"2": {0b01110, 0b10001, 0b00001, 0b00010, 0b00100, 0b01000, 0b11111},
		"3": {0b11111, 0b00010, 0b00100, 0b00010, 0b00001, 0b10001, 0b01110},
		"4": {0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010},
		"5": {0b11111, 0b10000, 0b11110, 0b00001, 0b00001, 0b10001, 0b01110},
		"6": {0b00110, 0b01000, 0b10000, 0b11110, 0b10001, 0b10001, 0b01110},
		"7": {0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b01000, 0b01000},
		"8": {0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110},
		"9": {0b01110, 0b10001, 0b10001, 0b01111, 0b00001, 0b00010, 0b01100},
	}
}

func (s *CaptchaService) cleanup() {
	ticker := time.NewTicker(1 * time.Minute)
	defer ticker.Stop()
	for range ticker.C {
		now := time.Now()
		s.store.Range(func(key, value any) bool {
			entry := value.(captchaEntry)
			if now.After(entry.expiresAt) {
				s.store.Delete(key)
			}
			return true
		})
	}
}

// FormatCaptchaImage returns a data URI for embedding in HTML/React.
func FormatCaptchaImage(base64PNG string) string {
	return fmt.Sprintf("data:image/png;base64,%s", base64PNG)
}
