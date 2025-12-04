import React from "react";
import { useLoaderData, useParams, useOutletContext } from "react-router-dom";
import MainContent from "../components/MainContent";

const SpaceView = () => {
  const { spaces } = useLoaderData();
  const { spaceId } = useParams();
  const context = useOutletContext();
  const activeSpace = spaces.find((s) => s.id === spaceId);

  return <MainContent currentView="space" activeSpace={activeSpace} spaces={spaces} {...context} />;
};

export default SpaceView;