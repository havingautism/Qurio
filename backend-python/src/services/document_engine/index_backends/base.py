from __future__ import annotations

from abc import ABC, abstractmethod


class IndexBackendBase(ABC):
    @abstractmethod
    def get_document_paths(self, *, space_id: str, document_id: str, filename: str):
        raise NotImplementedError

    @abstractmethod
    def resolve_existing_index_db(self, paths):
        raise NotImplementedError

    @abstractmethod
    def reset_document_index(self, *, paths):
        raise NotImplementedError

    @abstractmethod
    def write_document_index(
        self,
        *,
        paths,
        document_id: str,
        doc_name: str,
        source_type: str,
        character_count: int,
        section_count: int,
        nodes: list[dict],
    ):
        raise NotImplementedError

    @abstractmethod
    def lexical_search(
        self,
        *,
        paths,
        query_text: str,
        limit: int,
    ):
        raise NotImplementedError

    @abstractmethod
    def delete_document_index(self, *, paths, space_id: str, document_id: str):
        raise NotImplementedError
