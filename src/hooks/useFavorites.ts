import { useEffect, useState } from 'react'
import type { Card } from '../types/card'

type FavGroups = Record<string, string[]> // グループ名 -> cardKeyの配列

const STORAGE_KEY = 'cardFavGroups'

function cardKey(c: Card): string {
  return `${c.set_code}__${c.type}__${c.slot}`
}

function loadFavGroups(): FavGroups {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

export function useFavorites() {
  const [favGroups, setFavGroups] = useState<FavGroups>(loadFavGroups)
  const [activeGroup, setActiveGroup] = useState<string | null>(null)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(favGroups))
  }, [favGroups])

  const isFav = (c: Card, group: string | null): boolean => {
    if (!group || !favGroups[group]) return false
    return favGroups[group].includes(cardKey(c))
  }

  const createGroup = (name: string) => {
    if (!name.trim()) return
    setFavGroups((prev) => (prev[name] ? prev : { ...prev, [name]: [] }))
    setActiveGroup(name)
  }

  const toggleFav = (c: Card) => {
    if (!activeGroup) return
    const key = cardKey(c)
    setFavGroups((prev) => {
      const arr = prev[activeGroup] ?? []
      const exists = arr.includes(key)
      const nextArr = exists ? arr.filter((k) => k !== key) : [...arr, key]
      return { ...prev, [activeGroup]: nextArr }
    })
  }

  const deleteGroup = (name: string) => {
    setFavGroups((prev) => {
      const next = { ...prev }
      delete next[name]
      return next
    })
    if (activeGroup === name) setActiveGroup(null)
  }

  return { favGroups, activeGroup, setActiveGroup, isFav, createGroup, toggleFav, deleteGroup, cardKey }
}