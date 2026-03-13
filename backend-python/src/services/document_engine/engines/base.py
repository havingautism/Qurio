from __future__ import annotations

from abc import ABC, abstractmethod


class DocumentEngineBase(ABC):
    @abstractmethod
    async def index_document(self, **kwargs):
        raise NotImplementedError

    @abstractmethod
    async def search_documents(self, **kwargs):
        raise NotImplementedError

    @abstractmethod
    async def delete_document(self, **kwargs):
        raise NotImplementedError
