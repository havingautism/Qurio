import React from "react";
import { useOutletContext } from "react-router-dom";
import MainContent from "../components/MainContent";

const HomeView = () => {
  const context = useOutletContext();

  return <MainContent currentView="home" {...context} />;
};

export default HomeView;