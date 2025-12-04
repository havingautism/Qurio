import React from "react";
import { useLoaderData, useOutletContext } from "react-router-dom";
import MainContent from "../components/MainContent";

const SpacesView = () => {
  const { spaces } = useLoaderData();
  const context = useOutletContext();

  return <MainContent currentView="spaces" spaces={spaces} {...context} />;
};

export default SpacesView;