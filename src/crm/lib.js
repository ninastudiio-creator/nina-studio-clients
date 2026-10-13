import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export const PRODUCTS = {
  personal_classic: 'עיצוב אישי קלאסי',
  personal_premium: 'עיצוב אישי פרימיום',
  wedding: 'אלבום חתונה',
  template: 'טמפלט',
  other: 'אחר',
}

export const OWNERS = {
  client: 'אצל הלקוחה',
  me: 'אצלך',
  neutral: 'ניטרלי',
  done: 'סגור',
}

export const FLAGS = { repair: 'תיקון בדפוס', hold: 'בהולד' }

export const DELIVERY = { direct: 'ישיר מהדפוס', via_me: 'דרכי', pickup: 'איסוף' }

export const ORDER_FIELDS =
  'id, client_id, product, product_name, topic, size, pages, ordered_at, stage, stage_since, flag, delivery, address, price, vat_rate, paid_via, receipt, print_cost, print_paid, shipping_cost, profit, wix_order_number, diprint_order_number, drive_folder_url, notes, needs_review, review_note, legacy_ref, created_at'

// Stages rarely change, so they are loaded once per page load.
let stagesPromise = null
export function loadStages() {
  if (!stagesPromise) {
    stagesPromise = supabase
      .from('stages')
      .select('*')
      .order('position')
      .then(({ data, error }) => {
        if (error) {
          stagesPromise = null
          throw error
        }
        return data
      })
  }
  return stagesPromise
}

export function useStages() {
  const [stages, setStages] = useState(null)
  useEffect(() => {
    loadStages().then(setStages).catch(() => setStages([]))
  }, [])
  return stages
}

export const stageOf = (stages, key) => stages?.find((s) => s.key === key)

// Stages that apply to a product (all of them when the product is unknown).
export const stagesFor = (stages, product) =>
  (stages || []).filter((s) => !product || s.products.includes(product))

export function nextStage(stages, order) {
  const path = stagesFor(stages, order.product)
  const i = path.findIndex((s) => s.key === order.stage)
  return i >= 0 ? path[i + 1] : null
}

export function daysSince(date) {
  if (!date) return null
  const ms = Date.now() - new Date(date).getTime()
  return Math.max(0, Math.floor(ms / 86400000))
}

export function daysText(n) {
  if (n === null || n === undefined) return '-'
  if (n === 0) return 'היום'
  if (n === 1) return 'אתמול'
  return `${n} ימים`
}

export function isLate(stages, order) {
  const s = stageOf(stages, order.stage)
  return !!s?.late_days && daysSince(order.stage_since) > s.late_days
}

export const money = (n) =>
  n === null || n === undefined || n === '' ? '-' : '₪' + Math.round(Number(n)).toLocaleString('he-IL')

export const dateText = (d) => (d ? new Date(d).toLocaleDateString('he-IL') : '-')

export function whatsappHref(phone) {
  const digits = (phone || '').replace(/\D/g, '')
  if (digits.length < 9) return null
  return `https://wa.me/972${digits.slice(-9)}`
}

export function productText(order) {
  const base = PRODUCTS[order.product] || 'מוצר לא ידוע'
  return order.product_name ? `${base} · ${order.product_name}` : base
}

export async function setOrderStage(orderId, stage) {
  return supabase.from('orders').update({ stage }).eq('id', orderId)
}
