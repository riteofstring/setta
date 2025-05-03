class EVRefFinder:
    def __init__(self, lsp_writers):
        self.lsp_writer = lsp_writers.basic

    async def get_code_and_cursor_position(self, paramInfoId, fullText):
        evRefs, var_value, new_positions = await self.get_ev_refs_and_process_them(
            paramInfoId, fullText
        )

    async def get_ev_refs_and_process_them(self, paramInfoId, fullText):
        candidateEVRefs = self.find_candidate_ev_refs(paramInfoId, fullText)
        print(f"candidateEVRefs {candidateEVRefs}\n\n", flush=True)
        evRefs = await self.find_ev_refs(candidateEVRefs, fullText)
        return None, None, None

    def find_candidate_ev_refs(self, paramInfoId, fullText):
        output = set()
        match = self.ev_ref_regex.search(fullText)
        while match:
            if ev_ref_does_not_refer_to_self(
                self.full_name_to_info, match.group(0), self.sectionId, paramInfoId
            ):
                output.add((match.group(0), match.start()))

            match = self.ev_ref_regex.search(fullText, match.start() + 1)
        return list(output)

    async def find_ev_refs(self, candidateEVRefs, fullText):
        evRefRequestId = create_new_id()
        candidateEVRefs = filter_candidates_by_scope(
            candidateEVRefs,
            fullText,
            onlyAfterGenCodeTemplateVar=False,
            templateVars=[],
        )
        if len(candidateEVRefs) == 0:
            return []
        code, position_offset, num_keywords = generate_code_for_reference_finding(
            candidateEVRefs,
            fullText,
            onlyAfterGenCodeTemplateVar=False,
            templateVars=[],
        )
        code_id = f"{self.sectionId}-{paramInfoId}-find-references"

    async def send_reference_requests(self):
        await self.lsp_writer.send_document_open_request(code_id, code)
        request_ids = []
        for idx in range(num_keywords):
            request_id = f"{message_id}-{idx}"
            request_ids.append(request_id)
            self.lsp_writers.basic.create_asyncio_task(
                self.lsp_writers.basic.send_reference_request(
                    position_offset=position_offset,
                    line=idx,
                    character=0,
                    code_id=code_id,
                    request_id=request_id,
                    return_id=message_id,
                    num_messages=num_keywords,
                ),
                request_id,
                local=local,
            )

        return request_ids
