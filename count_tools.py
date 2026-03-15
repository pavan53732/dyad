#!/usr/bin/env python3
"""
Script to count the actual tools in the Dyad tool definitions file
"""

import re

def count_tools():
    with open('src/pro/main/ipc/handlers/local_agent/tool_definitions.ts', 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Find the TOOL_DEFINITIONS array section
    start_marker = 'export const TOOL_DEFINITIONS: readonly ToolDefinition[] = ['
    start_pos = content.find(start_marker)
    
    if start_pos == -1:
        print("Could not find TOOL_DEFINITIONS start")
        return 0
    
    # Find the start of the actual array content (after the opening bracket)
    array_start = content.find('[', start_pos)
    if array_start == -1:
        print("Could not find array opening bracket")
        return 0
    
    array_start += 1  # Move past the opening bracket
    
    # Now find the matching closing bracket by counting brackets
    bracket_count = 1
    pos = array_start
    while pos < len(content) and bracket_count > 0:
        if content[pos] == '[':
            bracket_count += 1
        elif content[pos] == ']':
            bracket_count -= 1
        pos += 1
    
    if bracket_count != 0:
        print("Could not find matching closing bracket")
        return 0
    
    # Extract the array content
    array_content = content[array_start:pos-1]
    
    # Split by lines and find tool references
    lines = array_content.split('\n')
    tools = []
    
    for line in lines:
        # Strip whitespace and comments
        clean_line = line.strip()
        
        # Remove inline comments
        if '//' in clean_line:
            clean_line = clean_line.split('//')[0].strip()
        
        # Check if this looks like a tool reference
        if clean_line and clean_line.endswith(','):
            tool_name = clean_line.rstrip(',').strip()
            if tool_name and not tool_name.startswith('//'):
                tools.append(tool_name)
    
    # Filter out empty lines and non-tool items
    actual_tools = []
    for tool in tools:
        # Skip comments and empty strings
        if tool and not tool.startswith('//') and tool != ',':
            actual_tools.append(tool)
    
    print(f"Total tools found: {len(actual_tools)}")
    print(f"First 30 tools:")
    for i in range(min(30, len(actual_tools))):
        tool = actual_tools[i]
        print(f"  {i+1:3d}. {tool}")
    
    if len(actual_tools) > 30:
        print(f"  ... and {len(actual_tools) - 30} more")
    
    # Check for specific tools mentioned in the Kade AI response
    kade_tools = [
        'basic_inference', 'metacognition', 'hypothesis_generator', 'counterfactual_reasoning', 
        'uncertainty_quantification', 'multi_agent_coordinator', 'agent_roles', 
        'hierarchical_teams', 'dynamic_agents', 'advanced_coordination', 'code_intelligence', 
        'program_slicing', 'formal_verification', 'runtime_analysis', 'code_representation', 
        'architecture_knowledge_graph', 'architecture_analyzer', 'architecture_validator', 
        'architecture_simulator', 'dependency_analyzer', 'dependency_governance', 
        'dependency_knowledge_graph', 'dependency_upgrader', 'security_scanner', 
        'vulnerability_detector', 'compliance_checker', 'security_remediation', 
        'documentation_intelligence', 'technical_debt'
    ]
    
    print(f"\nChecking for tools mentioned in Kade AI response:")
    found_kade_tools = []
    missing_kade_tools = []
    
    for kade_tool in kade_tools:
        found = False
        for actual_tool in actual_tools:
            # Check if the tool name appears in the actual tool (could be part of a namespace)
            if kade_tool in actual_tool.lower():
                found = True
                found_kade_tools.append(kade_tool)
                break
        
        if not found:
            missing_kade_tools.append(kade_tool)
    
    print(f"Found: {len(found_kade_tools)}/{len(kade_tools)} tools")
    print(f"Found tools: {found_kade_tools}")
    print(f"Missing tools: {missing_kade_tools}")
    
    return len(actual_tools)

if __name__ == "__main__":
    count = count_tools()
    print(f"\nFINAL TOOL COUNT: {count}")