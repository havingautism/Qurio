import React from "react";
import MainContent from "../components/MainContent";
import { useAppContext } from "../App";

const HomeView = () => {
  const context = useAppContext();

  return <MainContent currentView="home" {...context} />;
};

export default HomeView;
