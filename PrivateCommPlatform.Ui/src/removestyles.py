import re
import os

with open('PrivateCommPlatform.Ui/src/App.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

css_classes = {}

def cssify(key):
    return re.sub(r'([A-Z])', r'-\1', key).lower()

def replacer(match):
    style_str = match.group(1)
    if '?' in style_str or '`' in style_str or '=>' in style_str or '...' in style_str:
        return match.group(0)
    
    # parse simple dict
    pairs = re.findall(r'([a-zA-Z0-9_]+)\s*:\s*[\'\"]([^\'\"]+)[\'\"]', style_str)
    if not pairs:
        return match.group(0)
        
    css_rules = []
    for k, v in pairs:
        css_rules.append(f'{cssify(k)}: {v};')
        
    rules_str = ' '.join(css_rules)
    
    if rules_str not in css_classes:
        class_name = 'auto-gen-p2-' + str(len(css_classes) + 1)
        css_classes[rules_str] = class_name
    else:
        class_name = css_classes[rules_str]
        
    return 'className="' + class_name + '" /* merged-style */'

new_content = re.sub(r'style=\{\{([^}]+)\}\}', replacer, content)

# Now merge duplicate classNames
# Example: className="foo" className="auto-gen-1" /* merged-style */
# Should become className="foo auto-gen-1"
def merge_classnames(match):
    cls1 = match.group(1)
    cls2 = match.group(2)
    return f'className="{cls1} {cls2}"'

new_content = re.sub(r'className=[\'\"]([^\'\"]+)[\'\"]\s+className=[\'\"]([^\'\"]+)[\'\"]\s*/\*\s*merged-style\s*\*/', merge_classnames, new_content)

with open('PrivateCommPlatform.Ui/src/App.jsx', 'w', encoding='utf-8') as f:
    f.write(new_content)

css_append = '\n/* Auto generated styles */\n'
for rules, cls in css_classes.items():
    css_append += f'.{cls} {{ {rules} }}\n'

with open('PrivateCommPlatform.Ui/src/index.css', 'a', encoding='utf-8') as f:
    f.write(css_append)

print(f'Replaced {len(css_classes)} distinct inline styles.')
