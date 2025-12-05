import React from 'react'
import MainContent from '../components/MainContent'
import { spaceRoute } from '../router'
import { useAppContext } from '../App'

const SpaceView = () => {
  const { spaceId } = spaceRoute.useParams()
  const context = useAppContext()
  const activeSpace = context?.spaces?.find(s => String(s.id) === String(spaceId)) || null

  return (
    <MainContent
      currentView="space"
      activeSpace={activeSpace}
      spaces={context?.spaces || []}
      {...context}
    />
  )
}

export default SpaceView
