import React from "react";
import { useOutletContext } from "react-router-dom";
import MainContent from "../components/MainContent";

const LibraryView = () => {
  const context = useOutletContext();

  return <MainContent currentView="library" {...context} />;
};

export default LibraryView;