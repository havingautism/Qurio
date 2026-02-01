from pydantic import BaseModel, Field, field_validator


class TitleResponse(BaseModel):
    """Response model for title generation."""
    title: str = Field(..., description="A short, concise title (max 5 words).")
    emojis: list[str] = Field(..., description="An array containing exactly 1 emoji character.")

    @field_validator("emojis", mode="before")
    @classmethod
    def parse_emojis(cls, v):
        if isinstance(v, str):
            import json
            try:
                # Try to parse if it's a JSON string representation of a list
                return json.loads(v)
            except json.JSONDecodeError:
                # If it's just a raw emoji string, wrap it in a list
                return [v]
        return v


class TitleSpaceResponse(BaseModel):
    """Response model for title and space generation."""
    title: str = Field(..., description="A short, concise title (max 5 words).")
    space_label: str | None = Field(default=None, alias="spaceLabel", description="The label of the selected space, or null if none fit.")
    emojis: list[str] = Field(..., description="An array containing exactly 1 emoji character.")

    @field_validator("emojis", mode="before")
    @classmethod
    def parse_emojis(cls, v):
        if isinstance(v, str):
            import json
            try:
                return json.loads(v)
            except json.JSONDecodeError:
                return [v]
        return v


class TitleSpaceAgentResponse(BaseModel):
    """Response model for title, space and agent generation."""
    title: str = Field(..., description="A short, concise title (max 5 words).")
    space_label: str | None = Field(default=None, alias="spaceLabel", description="The label of the selected space, or null if none fit.")
    agent_name: str | None = Field(default=None, alias="agentName", description="The name of the selected agent, or null if none fit.")
    emojis: list[str] = Field(..., description="An array containing exactly 1 emoji character.")

    @field_validator("emojis", mode="before")
    @classmethod
    def parse_emojis(cls, v):
        if isinstance(v, str):
            import json
            try:
                return json.loads(v)
            except json.JSONDecodeError:
                return [v]
        return v


class RelatedQuestionsResponse(BaseModel):
    """Response model for related questions generation."""
    questions: list[str] = Field(..., description="A list of exactly 3 relevant follow-up questions.")


class DailyTipResponse(BaseModel):
    """Response model for daily tip generation."""
    tip: str = Field(..., description="A short, practical tip for today (1-2 sentences).")
