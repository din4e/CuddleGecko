package middleware

import (
	"errors"
	"strings"

	"github.com/din4e/cuddlegecko/pkg/config"
	"github.com/din4e/cuddlegecko/pkg/response"
	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

// ErrInvalidToken is returned by ParseAccessToken for any malformed, tampered,
// expired or otherwise unacceptable access token.
var ErrInvalidToken = errors.New("invalid or expired token")

// ParseAccessToken validates a JWT access token and returns the user id from its
// claims. Shared by the JWTAuth middleware (Bearer header) and the WebSocket
// upgrade handler (query-string token), so WS connections enforce the same
// identity check even though browsers cannot set an Authorization header on the
// WS handshake.
func ParseAccessToken(tokenStr string, jwtCfg *config.JWTConfig) (uint, error) {
	token, err := jwt.Parse(tokenStr, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, jwt.ErrSignatureInvalid
		}
		return []byte(jwtCfg.Secret), nil
	})
	if err != nil || !token.Valid {
		return 0, ErrInvalidToken
	}
	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return 0, ErrInvalidToken
	}
	userID, ok := claims["user_id"].(float64)
	if !ok {
		return 0, ErrInvalidToken
	}
	return uint(userID), nil
}

func JWTAuth(jwtCfg *config.JWTConfig) gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			response.Unauthorized(c, "missing authorization header")
			c.Abort()
			return
		}
		parts := strings.SplitN(authHeader, " ", 2)
		if len(parts) != 2 || parts[0] != "Bearer" {
			response.Unauthorized(c, "invalid authorization format")
			c.Abort()
			return
		}
		userID, err := ParseAccessToken(parts[1], jwtCfg)
		if err != nil {
			response.Unauthorized(c, "invalid or expired token")
			c.Abort()
			return
		}
		c.Set("user_id", userID)
		c.Next()
	}
}

func GetUserID(c *gin.Context) uint {
	return c.GetUint("user_id")
}
