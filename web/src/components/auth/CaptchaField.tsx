import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type CaptchaFieldProps = {
  image: string
  answer: string
  onAnswerChange: (value: string) => void
  onRefresh: () => void
  labelText: string
  placeholder: string
  /** 图片可访问ible名称（兼作按钮名），不暴露答案 */
  imageAlt: string
  /** 鼠标悬停提示：点击刷新 */
  refreshLabel: string
  id?: string
}

/**
 * 图形验证码字段：图片按钮（点击刷新）+ 输入框。
 * 图片高度对齐输入框（h-8），避免验证码行比其它字段高。
 */
export function CaptchaField({
  image,
  answer,
  onAnswerChange,
  onRefresh,
  labelText,
  placeholder,
  imageAlt,
  refreshLabel,
  id = 'captcha-answer',
}: CaptchaFieldProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{labelText}</Label>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onRefresh}
          title={refreshLabel}
          className="flex h-8 shrink-0 items-center overflow-hidden rounded-lg border border-input bg-background p-0 transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <img src={image} alt={imageAlt} className="h-8 w-auto block" />
        </button>
        <Input
          id={id}
          value={answer}
          onChange={(e) => onAnswerChange(e.target.value)}
          required
          placeholder={placeholder}
          className="flex-1"
          autoComplete="off"
        />
      </div>
    </div>
  )
}
